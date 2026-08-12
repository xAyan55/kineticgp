import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { Server, User } from '../types';
import { FileManagerService } from './fileManagerService';
import { PluginCompatibilityService } from './pluginCompatibilityService';
import { ModrinthService, ModrinthVersion, ModrinthFile } from './modrinthService';
import { ActivityModel } from '../models/activityModel';

export interface InstalledPluginInfo {
  filename: string;
  size: number;
  formattedSize: string;
  modified: string;
  projectSlug?: string;
  projectName?: string;
  installedVersion?: string;
  isExternal: boolean;
}

export interface PluginDownloadProgress {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  status: 'downloading' | 'verifying' | 'completed' | 'failed';
  formattedLoaded: string;
  formattedTotal: string;
  filename?: string;
  version?: string;
  requiresRestart?: boolean;
  error?: string;
}

export class PluginManagerService {
  private static operationLocks = new Set<string>();
  private static progressMap = new Map<string, PluginDownloadProgress>();

  static getProgress(lockKey: string): PluginDownloadProgress | null {
    return this.progressMap.get(lockKey) || null;
  }

  private static setProgress(lockKey: string, progress: PluginDownloadProgress): void {
    this.progressMap.set(lockKey, progress);
  }

  private static clearProgress(lockKey: string): void {
    this.progressMap.delete(lockKey);
  }

  private static acquireLock(key: string): boolean {
    if (this.operationLocks.has(key)) return false;
    this.operationLocks.add(key);
    return true;
  }

  private static releaseLock(key: string): void {
    this.operationLocks.delete(key);
  }

  /**
   * Scans {server_directory}/plugins/ on disk for installed .jar files.
   */
  static getInstalledPlugins(server: Server): InstalledPluginInfo[] {
    const pluginsDir = FileManagerService.getSanitizedPath(server, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(pluginsDir);
    const installed: InstalledPluginInfo[] = [];

    for (const file of files) {
      if (!file.toLowerCase().endsWith('.jar')) continue;
      const fullPath = path.join(pluginsDir, file);

      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          installed.push({
            filename: file,
            size: stats.size,
            formattedSize: FileManagerService.formatBytes(stats.size),
            modified: stats.mtime.toISOString().split('T')[0],
            isExternal: true
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return installed.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  /**
   * Safely streams download an HTTPS file to a temporary .tmp destination,
   * calculating SHA-512 / SHA-1 hashes during stream execution.
   */
  private static downloadStream(url: string, destTmpPath: string, expectedHashes?: { sha512?: string; sha1?: string }, lockKey?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destTmpPath);
      const hash512 = crypto.createHash('sha512');
      const hash1 = crypto.createHash('sha1');

      const handleResponse = (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location;
          const client = redirectUrl.startsWith('https') ? https : http;
          client.get(redirectUrl, { headers: { 'User-Agent': 'xAyan55/KineticGP/1.0.0' } }, handleResponse).on('error', handleError);
          return;
        }

        if (res.statusCode !== 200) {
          fileStream.close(() => {
            if (fs.existsSync(destTmpPath)) fs.unlinkSync(destTmpPath);
            const err = new Error(`Download failed with HTTP status ${res.statusCode}`);
            (err as any).code = 'DOWNLOAD_HTTP_ERROR';
            reject(err);
          });
          return;
        }

        const totalHeader = res.headers['content-length'];
        const totalBytes = totalHeader ? parseInt(totalHeader, 10) : 0;
        let loadedBytes = 0;

        if (lockKey) {
          PluginManagerService.setProgress(lockKey, {
            loadedBytes: 0,
            totalBytes,
            percent: 0,
            status: 'downloading',
            formattedLoaded: '0 B',
            formattedTotal: FileManagerService.formatBytes(totalBytes)
          });
        }

        res.on('data', (chunk: any) => {
          loadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
          if (lockKey) {
            PluginManagerService.setProgress(lockKey, {
              loadedBytes,
              totalBytes,
              percent,
              status: 'downloading',
              formattedLoaded: FileManagerService.formatBytes(loadedBytes),
              formattedTotal: FileManagerService.formatBytes(totalBytes)
            });
          }
          hash512.update(chunk);
          hash1.update(chunk);
          fileStream.write(chunk);
        });

        res.on('end', () => {
          fileStream.end(() => {
            if (lockKey) {
              PluginManagerService.setProgress(lockKey, {
                loadedBytes,
                totalBytes,
                percent: 100,
                status: 'verifying',
                formattedLoaded: FileManagerService.formatBytes(loadedBytes),
                formattedTotal: FileManagerService.formatBytes(totalBytes)
              });
            }

            const computed512 = hash512.digest('hex');
            const computed1 = hash1.digest('hex');

            if (expectedHashes?.sha512 && computed512.toLowerCase() !== expectedHashes.sha512.toLowerCase()) {
              if (fs.existsSync(destTmpPath)) fs.unlinkSync(destTmpPath);
              const err = new Error('Download verification failed: SHA-512 hash mismatch');
              (err as any).code = 'HASH_MISMATCH';
              return reject(err);
            }

            if (expectedHashes?.sha1 && computed1.toLowerCase() !== expectedHashes.sha1.toLowerCase()) {
              if (fs.existsSync(destTmpPath)) fs.unlinkSync(destTmpPath);
              const err = new Error('Download verification failed: SHA-1 hash mismatch');
              (err as any).code = 'HASH_MISMATCH';
              return reject(err);
            }

            resolve();
          });
        });
      };

      const handleError = (err: any) => {
        fileStream.close(() => {
          if (fs.existsSync(destTmpPath)) fs.unlinkSync(destTmpPath);
          reject(err);
        });
      };

      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'xAyan55/KineticGP/1.0.0' } }, handleResponse);

      req.on('error', handleError);

      req.setTimeout(30000, () => {
        req.destroy();
        fileStream.close(() => {
          if (fs.existsSync(destTmpPath)) fs.unlinkSync(destTmpPath);
          const err = new Error('Download timed out after 30 seconds.');
          (err as any).code = 'DOWNLOAD_TIMEOUT';
          reject(err);
        });
      });
    });
  }

  /**
   * Installs a plugin from Modrinth.
   */
  static async installPlugin(server: Server, projectIdOrSlug: string, user: User, ipAddress: string = '127.0.0.1'): Promise<{ success: boolean; filename: string; version: string; requiresRestart: boolean }> {
    if (!PluginCompatibilityService.isSupportedServerSoftware(server)) {
      const err = new Error('Plugin installation is unavailable because this server\'s software is not Bukkit-compatible.');
      (err as any).code = 'INCOMPATIBLE_SERVER';
      (err as any).statusCode = 400;
      throw err;
    }

    const lockKey = `${server.uuid}:${projectIdOrSlug}`;
    if (!this.acquireLock(lockKey)) {
      const err = new Error('An installation operation is already in progress for this plugin.');
      (err as any).code = 'OPERATION_IN_PROGRESS';
      (err as any).statusCode = 409;
      throw err;
    }

    try {
      PluginManagerService.setProgress(lockKey, {
        loadedBytes: 0,
        totalBytes: 0,
        percent: 0,
        status: 'downloading',
        formattedLoaded: '0 B',
        formattedTotal: '0 B'
      });

      const project = await ModrinthService.getProject(projectIdOrSlug);
      if (!project || !PluginCompatibilityService.isPluginProject(project)) {
        const err = new Error('Selected project is not a valid Bukkit-compatible plugin.');
        (err as any).code = 'INVALID_PLUGIN_PROJECT';
        (err as any).statusCode = 400;
        throw err;
      }

      const versions = await ModrinthService.getVersions(project.id, server.version);
      const compatibleVersions = PluginCompatibilityService.filterCompatibleVersions(versions, server);

      if (compatibleVersions.length === 0) {
        const err = new Error(`No compatible plugin version found for ${server.software} ${server.version || ''}`);
        (err as any).code = 'NO_COMPATIBLE_VERSION';
        (err as any).statusCode = 400;
        throw err;
      }

      const targetVersion = compatibleVersions[0];
      const primaryFile = PluginCompatibilityService.selectPrimaryFile(targetVersion);

      if (!primaryFile) {
        const err = new Error('No valid .jar release file found for this plugin version.');
        (err as any).code = 'NO_JAR_FILE';
        (err as any).statusCode = 400;
        throw err;
      }

      const pluginsDir = FileManagerService.getSanitizedPath(server, 'plugins');
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
      }

      const sanitizedFilename = path.basename(primaryFile.filename);
      const targetJarPath = FileManagerService.getSanitizedPath(server, path.join('plugins', sanitizedFilename));
      const tempTmpPath = `${targetJarPath}.tmp`;

      // Check if already installed
      if (fs.existsSync(targetJarPath)) {
        // Plugin file exists
      }

      await this.downloadStream(primaryFile.url, tempTmpPath, primaryFile.hashes, lockKey);

      // Atomic rename
      if (fs.existsSync(targetJarPath)) {
        fs.unlinkSync(targetJarPath);
      }
      fs.renameSync(tempTmpPath, targetJarPath);

      ActivityModel.log(user.id, user.username, 'PLUGIN_INSTALL', `Installed plugin ${project.title} (${targetVersion.version_number}) on server ${server.name}`, ipAddress);

      const result = {
        success: true,
        filename: sanitizedFilename,
        version: targetVersion.version_number,
        requiresRestart: server.status === 'online'
      };

      PluginManagerService.setProgress(lockKey, {
        loadedBytes: primaryFile.size || 0,
        totalBytes: primaryFile.size || 0,
        percent: 100,
        status: 'completed',
        formattedLoaded: FileManagerService.formatBytes(primaryFile.size || 0),
        formattedTotal: FileManagerService.formatBytes(primaryFile.size || 0),
        filename: sanitizedFilename,
        version: targetVersion.version_number,
        requiresRestart: server.status === 'online'
      });

      setTimeout(() => {
        PluginManagerService.clearProgress(lockKey);
        PluginManagerService.releaseLock(lockKey);
      }, 30000);

      return result;
    } catch (e: any) {
      PluginManagerService.setProgress(lockKey, {
        loadedBytes: 0,
        totalBytes: 0,
        percent: 0,
        status: 'failed',
        formattedLoaded: '0 B',
        formattedTotal: '0 B',
        error: e.message || 'Installation failed.'
      });

      setTimeout(() => {
        PluginManagerService.clearProgress(lockKey);
        PluginManagerService.releaseLock(lockKey);
      }, 30000);

      throw e;
    }
  }

  /**
   * Deletes an installed plugin .jar file from disk.
   */
  static deletePlugin(server: Server, filename: string, user: User, ipAddress: string = '127.0.0.1'): { success: boolean } {
    if (!filename || !filename.toLowerCase().endsWith('.jar')) {
      const err = new Error('Invalid plugin file name.');
      (err as any).code = 'INVALID_FILENAME';
      (err as any).statusCode = 400;
      throw err;
    }

    const sanitizedFilename = path.basename(filename);
    const lockKey = `${server.uuid}:${sanitizedFilename}`;
    if (!this.acquireLock(lockKey)) {
      const err = new Error('An operation is already in progress for this plugin file.');
      (err as any).code = 'OPERATION_IN_PROGRESS';
      (err as any).statusCode = 409;
      throw err;
    }

    try {
      const targetPath = FileManagerService.getSanitizedPath(server, path.join('plugins', sanitizedFilename));

      if (!fs.existsSync(targetPath)) {
        const err = new Error('Target plugin file does not exist on disk.');
        (err as any).code = 'FILE_NOT_FOUND';
        (err as any).statusCode = 404;
        throw err;
      }

      fs.unlinkSync(targetPath);
      ActivityModel.log(user.id, user.username, 'PLUGIN_DELETE', `Deleted plugin file ${sanitizedFilename} from server ${server.name}`, ipAddress);

      return { success: true };
    } finally {
      this.releaseLock(lockKey);
    }
  }
}

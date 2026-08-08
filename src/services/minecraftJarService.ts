import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { EventEmitter } from 'events';

export class MinecraftJarService extends EventEmitter {
  static getStoragePath(serverUuid: string): string {
    const dir = path.join(process.cwd(), 'storage', 'servers', serverUuid);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static async downloadFile(
    url: string,
    destPath: string,
    onProgress?: (downloaded: number, total: number, percent: number, speed: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      
      const startTime = Date.now();

      const req = client.get(url, { timeout: 30000 }, (res) => {
        // Handle HTTP redirects (301, 302, 307, 308)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastReportTime = Date.now();
        let lastReportBytes = 0;

        const fileStream = fs.createWriteStream(destPath);
        
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          
          if (onProgress && (now - lastReportTime >= 500 || downloadedBytes === totalBytes)) {
            const timeDiff = (now - lastReportTime) / 1000 || 0.5;
            const bytesDiff = downloadedBytes - lastReportBytes;
            const speedBps = bytesDiff / timeDiff;
            const speedFormatted = `${this.formatBytes(speedBps)}/s`;

            const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
            onProgress(downloadedBytes, totalBytes, percent, speedFormatted);

            lastReportTime = now;
            lastReportBytes = downloadedBytes;
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download connection timed out'));
      });

      req.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  static async fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchJson<T>(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('JSON fetch timed out'));
      });
      req.on('error', reject);
    });
  }

  static async resolveDownloadUrl(software: string, version: string, logger?: (msg: string) => void): Promise<string> {
    const softLower = software.toLowerCase();

    // 1. PaperMC API
    if (softLower.includes('paper')) {
      // Primary: fill.papermc.io v3 (api.papermc.io/v2 was decommissioned, returns HTTP 410)
      try {
        const fillUri = `https://fill.papermc.io/v3/projects/paper/versions/${version}/builds/latest`;
        if (logger) logger(`[HTTP] GET ${fillUri}`);
        const buildInfo = await this.fetchJson<{
          id: number;
          downloads?: { 'server:default'?: { url?: string } };
        }>(fillUri);
        const url = buildInfo?.downloads?.['server:default']?.url;
        if (url) return url;
      } catch (e) {
        if (logger) logger(`[Installer] PaperMC fill API resolution failed for ${version}, trying legacy API...`);
      }

      // Fallback: legacy api.papermc.io v2
      try {
        const apiUri = `https://api.papermc.io/v2/projects/paper/versions/${version}`;
        if (logger) logger(`[HTTP] GET ${apiUri}`);
        const buildInfo = await this.fetchJson<{ builds: number[] }>(apiUri);
        if (buildInfo && buildInfo.builds && buildInfo.builds.length > 0) {
          const latestBuild = buildInfo.builds[buildInfo.builds.length - 1];
          return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
        }
      } catch (e) {
        if (logger) logger(`[Installer] PaperMC API resolution failed for ${version}, trying fallback...`);
      }
    }

    // 2. PurpurMC API
    if (softLower.includes('purpur')) {
      const apiUri = `https://purpurmc.org/api/v2/purpur/${version}`;
      if (logger) logger(`[HTTP] GET ${apiUri}`);
      try {
        const buildInfo = await this.fetchJson<{ builds: { latest: string } }>(apiUri);
        if (buildInfo && buildInfo.builds && buildInfo.builds.latest) {
          return `https://purpurmc.org/api/v2/purpur/${version}/${buildInfo.builds.latest}/download`;
        }
      } catch (e) {
        if (logger) logger(`[Installer] Purpur API resolution failed for ${version}, trying fallback...`);
      }
    }

    // 3. mcjars.app API (v2 & v1)
    const mcjarsUri = `https://api.mcjars.app/v2/builds/${software.toLowerCase()}/${version}/latest`;
    if (logger) logger(`[HTTP] GET ${mcjarsUri}`);
    try {
      const jarInfo = await this.fetchJson<{ downloadUrl?: string; url?: string }>(mcjarsUri);
      if (jarInfo.downloadUrl || jarInfo.url) {
        return (jarInfo.downloadUrl || jarInfo.url)!;
      }
    } catch {
      // fallback
    }

    // 4. Mojang Official Vanilla Manifest (ONLY when vanilla was requested)
    if (softLower.includes('vanilla')) {
      const mojangUri = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
      if (logger) logger(`[HTTP] GET ${mojangUri}`);
      try {
        const manifest = await this.fetchJson<{ versions: { id: string; url: string }[] }>(mojangUri);
        const verObj = manifest.versions.find(v => v.id === version);
        if (verObj) {
          const verDetails = await this.fetchJson<{ downloads: { server: { url: string } } }>(verObj.url);
          if (verDetails?.downloads?.server?.url) {
            return verDetails.downloads.server.url;
          }
        }
      } catch {
        // fallback to throw below
      }
    }

    // 5. Fail loudly instead of silently installing the wrong software
    throw new Error(
      `Could not resolve a download URL for ${software} ${version}. ` +
      `The ${software} API may be unreachable from this host or the version may not exist.`
    );
  }
}

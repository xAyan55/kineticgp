"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginManagerService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const fileManagerService_1 = require("./fileManagerService");
const pluginCompatibilityService_1 = require("./pluginCompatibilityService");
const modrinthService_1 = require("./modrinthService");
const activityModel_1 = require("../models/activityModel");
class PluginManagerService {
    static operationLocks = new Set();
    static acquireLock(key) {
        if (this.operationLocks.has(key))
            return false;
        this.operationLocks.add(key);
        return true;
    }
    static releaseLock(key) {
        this.operationLocks.delete(key);
    }
    /**
     * Scans {server_directory}/plugins/ on disk for installed .jar files.
     */
    static getInstalledPlugins(server) {
        const pluginsDir = fileManagerService_1.FileManagerService.getSanitizedPath(server, 'plugins');
        if (!fs_1.default.existsSync(pluginsDir)) {
            fs_1.default.mkdirSync(pluginsDir, { recursive: true });
            return [];
        }
        const files = fs_1.default.readdirSync(pluginsDir);
        const installed = [];
        for (const file of files) {
            if (!file.toLowerCase().endsWith('.jar'))
                continue;
            const fullPath = path_1.default.join(pluginsDir, file);
            try {
                const stats = fs_1.default.statSync(fullPath);
                if (stats.isFile()) {
                    installed.push({
                        filename: file,
                        size: stats.size,
                        formattedSize: fileManagerService_1.FileManagerService.formatBytes(stats.size),
                        modified: stats.mtime.toISOString().split('T')[0],
                        isExternal: true
                    });
                }
            }
            catch {
                // Skip unreadable files
            }
        }
        return installed.sort((a, b) => a.filename.localeCompare(b.filename));
    }
    /**
     * Safely streams download an HTTPS file to a temporary .tmp destination,
     * calculating SHA-512 / SHA-1 hashes during stream execution.
     */
    static downloadStream(url, destTmpPath, expectedHashes) {
        return new Promise((resolve, reject) => {
            const fileStream = fs_1.default.createWriteStream(destTmpPath);
            const hash512 = crypto_1.default.createHash('sha512');
            const hash1 = crypto_1.default.createHash('sha1');
            const handleResponse = (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = res.headers.location;
                    const client = redirectUrl.startsWith('https') ? https_1.default : http_1.default;
                    client.get(redirectUrl, { headers: { 'User-Agent': 'xAyan55/KineticGP/1.0.0' } }, handleResponse).on('error', handleError);
                    return;
                }
                if (res.statusCode !== 200) {
                    fileStream.close(() => {
                        if (fs_1.default.existsSync(destTmpPath))
                            fs_1.default.unlinkSync(destTmpPath);
                        const err = new Error(`Download failed with HTTP status ${res.statusCode}`);
                        err.code = 'DOWNLOAD_HTTP_ERROR';
                        reject(err);
                    });
                    return;
                }
                res.on('data', (chunk) => {
                    hash512.update(chunk);
                    hash1.update(chunk);
                    fileStream.write(chunk);
                });
                res.on('end', () => {
                    fileStream.end(() => {
                        const computed512 = hash512.digest('hex');
                        const computed1 = hash1.digest('hex');
                        if (expectedHashes?.sha512 && computed512.toLowerCase() !== expectedHashes.sha512.toLowerCase()) {
                            if (fs_1.default.existsSync(destTmpPath))
                                fs_1.default.unlinkSync(destTmpPath);
                            const err = new Error('Download verification failed: SHA-512 hash mismatch');
                            err.code = 'HASH_MISMATCH';
                            return reject(err);
                        }
                        if (expectedHashes?.sha1 && computed1.toLowerCase() !== expectedHashes.sha1.toLowerCase()) {
                            if (fs_1.default.existsSync(destTmpPath))
                                fs_1.default.unlinkSync(destTmpPath);
                            const err = new Error('Download verification failed: SHA-1 hash mismatch');
                            err.code = 'HASH_MISMATCH';
                            return reject(err);
                        }
                        resolve();
                    });
                });
            };
            const handleError = (err) => {
                fileStream.close(() => {
                    if (fs_1.default.existsSync(destTmpPath))
                        fs_1.default.unlinkSync(destTmpPath);
                    reject(err);
                });
            };
            const client = url.startsWith('https') ? https_1.default : http_1.default;
            const req = client.get(url, { headers: { 'User-Agent': 'xAyan55/KineticGP/1.0.0' } }, handleResponse);
            req.on('error', handleError);
            req.setTimeout(30000, () => {
                req.destroy();
                fileStream.close(() => {
                    if (fs_1.default.existsSync(destTmpPath))
                        fs_1.default.unlinkSync(destTmpPath);
                    const err = new Error('Download timed out after 30 seconds.');
                    err.code = 'DOWNLOAD_TIMEOUT';
                    reject(err);
                });
            });
        });
    }
    /**
     * Installs a plugin from Modrinth.
     */
    static async installPlugin(server, projectIdOrSlug, user, ipAddress = '127.0.0.1') {
        if (!pluginCompatibilityService_1.PluginCompatibilityService.isSupportedServerSoftware(server)) {
            const err = new Error('Plugin installation is unavailable because this server\'s software is not Bukkit-compatible.');
            err.code = 'INCOMPATIBLE_SERVER';
            err.statusCode = 400;
            throw err;
        }
        const lockKey = `${server.uuid}:${projectIdOrSlug}`;
        if (!this.acquireLock(lockKey)) {
            const err = new Error('An installation operation is already in progress for this plugin.');
            err.code = 'OPERATION_IN_PROGRESS';
            err.statusCode = 409;
            throw err;
        }
        try {
            const project = await modrinthService_1.ModrinthService.getProject(projectIdOrSlug);
            if (!project || !pluginCompatibilityService_1.PluginCompatibilityService.isPluginProject(project)) {
                const err = new Error('Selected project is not a valid Bukkit-compatible plugin.');
                err.code = 'INVALID_PLUGIN_PROJECT';
                err.statusCode = 400;
                throw err;
            }
            const versions = await modrinthService_1.ModrinthService.getVersions(project.id, server.version);
            const compatibleVersions = pluginCompatibilityService_1.PluginCompatibilityService.filterCompatibleVersions(versions, server);
            if (compatibleVersions.length === 0) {
                const err = new Error(`No compatible plugin version found for ${server.software} ${server.version || ''}`);
                err.code = 'NO_COMPATIBLE_VERSION';
                err.statusCode = 400;
                throw err;
            }
            const targetVersion = compatibleVersions[0];
            const primaryFile = pluginCompatibilityService_1.PluginCompatibilityService.selectPrimaryFile(targetVersion);
            if (!primaryFile) {
                const err = new Error('No valid .jar release file found for this plugin version.');
                err.code = 'NO_JAR_FILE';
                err.statusCode = 400;
                throw err;
            }
            const pluginsDir = fileManagerService_1.FileManagerService.getSanitizedPath(server, 'plugins');
            if (!fs_1.default.existsSync(pluginsDir)) {
                fs_1.default.mkdirSync(pluginsDir, { recursive: true });
            }
            const sanitizedFilename = path_1.default.basename(primaryFile.filename);
            const targetJarPath = fileManagerService_1.FileManagerService.getSanitizedPath(server, path_1.default.join('plugins', sanitizedFilename));
            const tempTmpPath = `${targetJarPath}.tmp`;
            // Check if already installed
            if (fs_1.default.existsSync(targetJarPath)) {
                // Plugin file exists
            }
            await this.downloadStream(primaryFile.url, tempTmpPath, primaryFile.hashes);
            // Atomic rename
            if (fs_1.default.existsSync(targetJarPath)) {
                fs_1.default.unlinkSync(targetJarPath);
            }
            fs_1.default.renameSync(tempTmpPath, targetJarPath);
            activityModel_1.ActivityModel.log(user.id, user.username, 'PLUGIN_INSTALL', `Installed plugin ${project.title} (${targetVersion.version_number}) on server ${server.name}`, ipAddress);
            return {
                success: true,
                filename: sanitizedFilename,
                version: targetVersion.version_number,
                requiresRestart: server.status === 'online'
            };
        }
        finally {
            this.releaseLock(lockKey);
        }
    }
    /**
     * Deletes an installed plugin .jar file from disk.
     */
    static deletePlugin(server, filename, user, ipAddress = '127.0.0.1') {
        if (!filename || !filename.toLowerCase().endsWith('.jar')) {
            const err = new Error('Invalid plugin file name.');
            err.code = 'INVALID_FILENAME';
            err.statusCode = 400;
            throw err;
        }
        const sanitizedFilename = path_1.default.basename(filename);
        const lockKey = `${server.uuid}:${sanitizedFilename}`;
        if (!this.acquireLock(lockKey)) {
            const err = new Error('An operation is already in progress for this plugin file.');
            err.code = 'OPERATION_IN_PROGRESS';
            err.statusCode = 409;
            throw err;
        }
        try {
            const targetPath = fileManagerService_1.FileManagerService.getSanitizedPath(server, path_1.default.join('plugins', sanitizedFilename));
            if (!fs_1.default.existsSync(targetPath)) {
                const err = new Error('Target plugin file does not exist on disk.');
                err.code = 'FILE_NOT_FOUND';
                err.statusCode = 404;
                throw err;
            }
            fs_1.default.unlinkSync(targetPath);
            activityModel_1.ActivityModel.log(user.id, user.username, 'PLUGIN_DELETE', `Deleted plugin file ${sanitizedFilename} from server ${server.name}`, ipAddress);
            return { success: true };
        }
        finally {
            this.releaseLock(lockKey);
        }
    }
}
exports.PluginManagerService = PluginManagerService;

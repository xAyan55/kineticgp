"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinecraftJarService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const events_1 = require("events");
class MinecraftJarService extends events_1.EventEmitter {
    static getStoragePath(serverUuid) {
        const dir = path_1.default.join(process.cwd(), 'storage', 'servers', serverUuid);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }
    static formatBytes(bytes) {
        if (bytes <= 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    static async downloadFile(url, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https_1.default : http_1.default;
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
                const fileStream = fs_1.default.createWriteStream(destPath);
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
                    fs_1.default.unlink(destPath, () => { });
                    reject(err);
                });
            });
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Download connection timed out'));
            });
            req.on('error', (err) => {
                fs_1.default.unlink(destPath, () => { });
                reject(err);
            });
        });
    }
    static async fetchJson(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https_1.default : http_1.default;
            const req = client.get(url, { timeout: 10000 }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return this.fetchJson(res.headers.location).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    }
                    catch (e) {
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
    static async resolveDownloadUrl(software, version, logger) {
        const softLower = software.toLowerCase();
        // 1. PaperMC API
        if (softLower.includes('paper')) {
            // Primary: fill.papermc.io v3 (api.papermc.io/v2 was decommissioned, returns HTTP 410)
            try {
                const fillUri = `https://fill.papermc.io/v3/projects/paper/versions/${version}/builds/latest`;
                if (logger)
                    logger(`[HTTP] GET ${fillUri}`);
                const buildInfo = await this.fetchJson(fillUri);
                const url = buildInfo?.downloads?.['server:default']?.url;
                if (url)
                    return url;
            }
            catch (e) {
                if (logger)
                    logger(`[Installer] PaperMC fill API resolution failed for ${version}, trying legacy API...`);
            }
            // Fallback: legacy api.papermc.io v2
            try {
                const apiUri = `https://api.papermc.io/v2/projects/paper/versions/${version}`;
                if (logger)
                    logger(`[HTTP] GET ${apiUri}`);
                const buildInfo = await this.fetchJson(apiUri);
                if (buildInfo && buildInfo.builds && buildInfo.builds.length > 0) {
                    const latestBuild = buildInfo.builds[buildInfo.builds.length - 1];
                    return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
                }
            }
            catch (e) {
                if (logger)
                    logger(`[Installer] PaperMC API resolution failed for ${version}, trying fallback...`);
            }
        }
        // 2. PurpurMC API
        if (softLower.includes('purpur')) {
            const apiUri = `https://purpurmc.org/api/v2/purpur/${version}`;
            if (logger)
                logger(`[HTTP] GET ${apiUri}`);
            try {
                const buildInfo = await this.fetchJson(apiUri);
                if (buildInfo && buildInfo.builds && buildInfo.builds.latest) {
                    return `https://purpurmc.org/api/v2/purpur/${version}/${buildInfo.builds.latest}/download`;
                }
            }
            catch (e) {
                if (logger)
                    logger(`[Installer] Purpur API resolution failed for ${version}, trying fallback...`);
            }
        }
        // 3. mcjars.app API (v2 & v1)
        const mcjarsUri = `https://api.mcjars.app/v2/builds/${software.toLowerCase()}/${version}/latest`;
        if (logger)
            logger(`[HTTP] GET ${mcjarsUri}`);
        try {
            const jarInfo = await this.fetchJson(mcjarsUri);
            if (jarInfo.downloadUrl || jarInfo.url) {
                return (jarInfo.downloadUrl || jarInfo.url);
            }
        }
        catch {
            // fallback
        }
        // 4. Mojang Official Vanilla Manifest Fallback
        const mojangUri = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
        if (logger)
            logger(`[HTTP] GET ${mojangUri}`);
        try {
            const manifest = await this.fetchJson(mojangUri);
            const verObj = manifest.versions.find(v => v.id === version);
            if (verObj) {
                const verDetails = await this.fetchJson(verObj.url);
                if (verDetails?.downloads?.server?.url) {
                    return verDetails.downloads.server.url;
                }
            }
        }
        catch {
            // fallback
        }
        // 5. Default fallback download URL (paper default)
        return `https://api.papermc.io/v2/projects/paper/versions/1.20.4/builds/496/downloads/paper-1.20.4-496.jar`;
    }
}
exports.MinecraftJarService = MinecraftJarService;

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
    // Panel software names -> MCJars server types (https://mcjars.app/api/v2/build)
    static MCJARS_TYPE_MAP = {
        paper: 'PAPER',
        purpur: 'PURPUR',
        vanilla: 'VANILLA',
        fabric: 'FABRIC',
        spigot: 'SPIGOT',
        folia: 'FOLIA',
        forge: 'FORGE',
        neoforge: 'NEOFORGE',
        quilt: 'QUILT',
        waterfall: 'WATERFALL',
        velocity: 'VELOCITY',
        bungeecord: 'BUNGEECORD',
        leaves: 'LEAVES',
        magma: 'MAGMA',
        mohist: 'MOHIST',
        pufferfish: 'PUFFERFISH',
        sponge: 'SPONGE',
        arclight: 'ARCLIGHT',
        canvas: 'CANVAS',
    };
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
    static async fetchJsonPost(url, body, headers = {}) {
        return new Promise((resolve, reject) => {
            const payload = typeof body === 'string' ? body : JSON.stringify(body);
            const client = url.startsWith('https') ? https_1.default : http_1.default;
            const req = client.request(url, {
                method: 'POST',
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'Accept': 'application/json',
                    'User-Agent': 'KineticGP/1.0',
                    ...headers
                }
            }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return this.fetchJsonPost(res.headers.location, body, headers).then(resolve).catch(reject);
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
                    }
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
                reject(new Error('JSON POST timed out'));
            });
            req.on('error', reject);
            req.end(payload);
        });
    }
    /**
     * Primary resolver: MCJars unified build API. Returns null when the software
     * type is not tracked by MCJars or the request fails, so callers can fall back.
     */
    static async resolveViaMcJars(software, version, logger) {
        const type = this.MCJARS_TYPE_MAP[software.toLowerCase()];
        if (!type) {
            if (logger)
                logger(`[Installer] Software "${software}" is not tracked by MCJars, trying legacy sources...`);
            return null;
        }
        const apiUrl = 'https://mcjars.app/api/v2/build';
        try {
            if (logger)
                logger(`[HTTP] POST ${apiUrl} {type: ${type}, versionId: ${version}}`);
            const res = await this.fetchJsonPost(apiUrl, { type, versionId: version });
            if (!res || !res.success) {
                if (logger)
                    logger(`[MCJars] API returned success=false for ${type} ${version}.`);
                return null;
            }
            if (!res.build?.jarUrl) {
                if (logger)
                    logger(`[MCJars] No downloadable build found for ${type} ${version}.`);
                return null;
            }
            const buildNumber = res.build.buildNumber;
            const buildLabel = buildNumber !== undefined
                ? (res.build.name && res.build.name !== `#${buildNumber}` ? `#${buildNumber} (${res.build.name})` : `#${buildNumber}`)
                : undefined;
            if (logger) {
                logger(`[MCJars] Resolved ${type} ${version} build ${buildLabel || ''}${res.version?.java ? ` | requires Java ${res.version.java}` : ''}`);
            }
            return {
                url: res.build.jarUrl,
                jarSize: res.build.jarSize ?? undefined,
                java: res.version?.java,
                buildLabel
            };
        }
        catch (e) {
            if (logger)
                logger(`[MCJars] Resolution failed for ${type} ${version}: ${e.message}`);
            return null;
        }
    }
    static async resolveDownloadUrl(software, version, logger) {
        const softLower = software.toLowerCase();
        // 1. Primary: MCJars unified API (supports Paper, Purpur, Vanilla, Fabric, ...)
        const mcjars = await this.resolveViaMcJars(software, version, logger);
        if (mcjars)
            return mcjars;
        // 2. Legacy fallback: PaperMC fill API v3 (only when Paper was requested)
        if (softLower.includes('paper')) {
            try {
                const fillUri = `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds/latest`;
                if (logger)
                    logger(`[HTTP] GET ${fillUri}`);
                const buildInfo = await this.fetchJson(fillUri);
                const url = buildInfo?.downloads?.['server:default']?.url;
                if (url) {
                    if (logger)
                        logger(`[Installer] Resolved Paper ${version} via PaperMC fill API.`);
                    return { url };
                }
            }
            catch (e) {
                if (logger)
                    logger(`[Installer] PaperMC fill API resolution failed for ${version}.`);
            }
        }
        // 3. Legacy fallback: PurpurMC API (only when Purpur was requested)
        if (softLower.includes('purpur')) {
            try {
                const apiUri = `https://purpurmc.org/api/v2/purpur/${encodeURIComponent(version)}`;
                if (logger)
                    logger(`[HTTP] GET ${apiUri}`);
                const buildInfo = await this.fetchJson(apiUri);
                if (buildInfo?.builds?.latest) {
                    if (logger)
                        logger(`[Installer] Resolved Purpur ${version} via PurpurMC API.`);
                    return { url: `https://purpurmc.org/api/v2/purpur/${encodeURIComponent(version)}/${buildInfo.builds.latest}/download` };
                }
            }
            catch (e) {
                if (logger)
                    logger(`[Installer] Purpur API resolution failed for ${version}.`);
            }
        }
        // 4. Legacy fallback: Mojang Official Vanilla Manifest (ONLY when vanilla was requested)
        if (softLower.includes('vanilla')) {
            const mojangUri = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
            if (logger)
                logger(`[HTTP] GET ${mojangUri}`);
            try {
                const manifest = await this.fetchJson(mojangUri);
                const verObj = manifest.versions.find(v => v.id === version);
                if (verObj) {
                    const verDetails = await this.fetchJson(verObj.url);
                    if (verDetails?.downloads?.server?.url) {
                        if (logger)
                            logger(`[Installer] Resolved Vanilla ${version} via Mojang manifest.`);
                        return { url: verDetails.downloads.server.url };
                    }
                }
            }
            catch (e) {
                if (logger)
                    logger(`[Installer] Mojang manifest resolution failed for ${version}.`);
            }
        }
        // 5. Fail loudly instead of silently installing the wrong software
        throw new Error(`Could not resolve a download URL for ${software} ${version}. ` +
            `The MCJars API and upstream ${software} sources were unreachable from this host, or the version does not exist for ${software}.`);
    }
}
exports.MinecraftJarService = MinecraftJarService;

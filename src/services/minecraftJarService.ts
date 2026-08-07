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

  static async downloadFile(url: string, destPath: string, onProgress?: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      
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

        const fileStream = fs.createWriteStream(destPath);
        
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0 && onProgress) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            onProgress(percent);
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

  static async resolveDownloadUrl(software: string, version: string): Promise<string> {
    const softLower = software.toLowerCase();

    // 1. PaperMC API
    if (softLower.includes('paper')) {
      try {
        const buildInfo = await this.fetchJson<{ builds: number[] }>(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
        if (buildInfo && buildInfo.builds && buildInfo.builds.length > 0) {
          const latestBuild = buildInfo.builds[buildInfo.builds.length - 1];
          return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
        }
      } catch (e) {
        console.log(`PaperMC API resolution failed for ${version}, trying fallback...`);
      }
    }

    // 2. PurpurMC API
    if (softLower.includes('purpur')) {
      try {
        const buildInfo = await this.fetchJson<{ builds: { latest: string } }>(`https://purpurmc.org/api/v2/purpur/${version}`);
        if (buildInfo && buildInfo.builds && buildInfo.builds.latest) {
          return `https://purpurmc.org/api/v2/purpur/${version}/${buildInfo.builds.latest}/download`;
        }
      } catch (e) {
        console.log(`Purpur API resolution failed for ${version}, trying fallback...`);
      }
    }

    // 3. mcjars.app API (v2 & v1)
    try {
      const jarInfo = await this.fetchJson<{ downloadUrl?: string; url?: string }>(`https://api.mcjars.app/v2/builds/${software.toLowerCase()}/${version}/latest`);
      if (jarInfo.downloadUrl || jarInfo.url) {
        return (jarInfo.downloadUrl || jarInfo.url)!;
      }
    } catch {
      // fallback
    }

    // 4. Mojang Official Vanilla Manifest Fallback
    try {
      const manifest = await this.fetchJson<{ versions: { id: string; url: string }[] }>('https://launchermeta.mojang.com/mc/game/version_manifest.json');
      const verObj = manifest.versions.find(v => v.id === version);
      if (verObj) {
        const verDetails = await this.fetchJson<{ downloads: { server: { url: string } } }>(verObj.url);
        if (verDetails?.downloads?.server?.url) {
          return verDetails.downloads.server.url;
        }
      }
    } catch {
      // fallback
    }

    // 5. Default fallback download URL (paper default)
    return `https://api.papermc.io/v2/projects/paper/versions/1.20.4/builds/496/downloads/paper-1.20.4-496.jar`;
  }

  static async installServer(serverUuid: string, software: string, version: string, port: number, name: string): Promise<string> {
    const targetDir = this.getStoragePath(serverUuid);
    const jarPath = path.join(targetDir, 'server.jar');

    console.log(`🚀 Installing ${software} ${version} for server ${name} (${serverUuid})...`);

    // 1. Resolve JAR download URL
    const downloadUrl = await this.resolveDownloadUrl(software, version);
    console.log(`⬇️ Downloading server JAR from: ${downloadUrl}`);

    // 2. Download server.jar
    await this.downloadFile(downloadUrl, jarPath);

    // 3. Generate eula.txt
    const eulaPath = path.join(targetDir, 'eula.txt');
    fs.writeFileSync(eulaPath, '# Auto-generated by KineticGP Panel\neula=true\n');

    // 4. Generate server.properties if missing
    const propsPath = path.join(targetDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      const defaultProps = `
# KineticGP Server Properties
server-port=${port}
query.port=${port}
motd=\\u00A7b${name} \\u00A77- Powered by \\u00A7bKineticGP
enable-rcon=false
max-players=20
online-mode=true
allow-nether=true
enable-command-block=true
gamemode=survival
difficulty=easy
pvp=true
view-distance=10
spawn-protection=0
`;
      fs.writeFileSync(propsPath, defaultProps.trim());
    }

    // 5. Create runtime directories
    const logsDir = path.join(targetDir, 'logs');
    const pluginsDir = path.join(targetDir, 'plugins');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

    console.log(`✅ Server ${name} installed successfully at ${targetDir}`);
    return targetDir;
  }
}

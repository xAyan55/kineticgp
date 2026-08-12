import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Server } from '../types';

export interface ServerMetrics {
  status: string;
  cpu: {
    percent: number | null;
    cores: number;
  };
  memory: {
    usedBytes: number | null;
    limitBytes: number;
    percent: number | null;
  };
  disk: {
    usedBytes: number | null;
    limitBytes: number | null;
    percent: number | null;
  };
  address: string;
}

interface PidCacheEntry {
  usedBytes: number;
  cpuPercent: number;
  fetchedAt: number;
}

interface DiskCacheEntry {
  usedBytes: number;
  fetchedAt: number;
}

export class MetricsService {
  private static pidCache = new Map<number, PidCacheEntry>();
  private static diskCache = new Map<string, DiskCacheEntry>();

  private static readonly PID_CACHE_TTL_MS = 2000;
  private static readonly DISK_CACHE_TTL_MS = 30000;

  /**
   * Helper to verify if a PID process is currently active.
   */
  public static isPidAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Samples process RAM (WorkingSet/RSS in bytes) and CPU % for a PID with TTL caching.
   */
  public static getPidUsage(pid: number): { usedBytes: number | null; cpuPercent: number | null } {
    if (!this.isPidAlive(pid)) {
      return { usedBytes: 0, cpuPercent: 0 };
    }

    const cached = this.pidCache.get(pid);
    if (cached && (Date.now() - cached.fetchedAt) < this.PID_CACHE_TTL_MS) {
      return { usedBytes: cached.usedBytes, cpuPercent: cached.cpuPercent };
    }

    let usedBytes: number | null = null;
    let cpuPercent: number | null = null;

    try {
      if (process.platform === 'win32') {
        // Query memory using tasklist CSV
        const tasklistOut = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf-8', timeout: 1500 });
        const memMatch = tasklistOut.match(/"([^"]+)"\s*,\s*"(\d+)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([\d,]+)\s*K"/i);
        if (memMatch && memMatch[3]) {
          const kb = parseInt(memMatch[3].replace(/,/g, ''), 10);
          if (!isNaN(kb)) usedBytes = kb * 1024;
        }

        // Query CPU percentage using wmic
        try {
          const wmicOut = execSync(`wmic path Win32_PerfFormattedData_PerfProc_Process where IDProcess=${pid} get PercentProcessorTime /value`, { encoding: 'utf-8', timeout: 1500 });
          const cpuMatch = wmicOut.match(/PercentProcessorTime=(\d+)/i);
          if (cpuMatch && cpuMatch[1]) {
            cpuPercent = Math.min(1000, parseInt(cpuMatch[1], 10));
          }
        } catch {
          if (usedBytes !== null) cpuPercent = 0;
        }
      } else {
        // Linux / macOS: ps -o %cpu=,rss= -p PID
        const psOut = execSync(`ps -o %cpu=,rss= -p ${pid} 2>/dev/null | tail -1`, { encoding: 'utf-8', timeout: 1500 }).trim();
        const parts = psOut.split(/\s+/);
        if (parts.length >= 2) {
          const cpu = parseFloat(parts[0]);
          const rssKb = parseInt(parts[1], 10);
          if (!isNaN(cpu)) cpuPercent = Math.round(cpu * 10) / 10;
          if (!isNaN(rssKb)) usedBytes = rssKb * 1024;
        }
      }
    } catch (e) {
      // If sampling fails, return null to indicate Unavailable
    }

    if (usedBytes !== null && cpuPercent !== null) {
      this.pidCache.set(pid, { usedBytes, cpuPercent, fetchedAt: Date.now() });
    }

    return { usedBytes, cpuPercent };
  }

  /**
   * Synchronously or asynchronously calculates total size of files inside server directory.
   */
  public static getDiskUsage(serverDir: string): number | null {
    if (!fs.existsSync(serverDir)) return 0;

    const cached = this.diskCache.get(serverDir);
    if (cached && (Date.now() - cached.fetchedAt) < this.DISK_CACHE_TTL_MS) {
      return cached.usedBytes;
    }

    let totalSize = 0;
    try {
      const calculateDirSize = (dirPath: string): number => {
        let size = 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            if (!entry.isSymbolicLink()) {
              size += calculateDirSize(fullPath);
            }
          } else if (entry.isFile()) {
            try {
              const stat = fs.statSync(fullPath);
              size += stat.size;
            } catch {}
          }
        }
        return size;
      };

      totalSize = calculateDirSize(serverDir);
      this.diskCache.set(serverDir, { usedBytes: totalSize, fetchedAt: Date.now() });
      return totalSize;
    } catch {
      return cached ? cached.usedBytes : null;
    }
  }

  /**
   * Assembles authoritative structured metrics for a server instance.
   */
  public static getServerMetrics(server: Server, pid: number | null): ServerMetrics {
    const serverDir = server.directory || path.join(process.cwd(), 'storage', 'servers', server.uuid);
    const limitRamBytes = (server.ram_limit || 2048) * 1024 * 1024;
    const limitDiskBytes = server.disk_limit ? server.disk_limit * 1024 * 1024 * 1024 : null;
    const cores = (server.cpu_limit || 100) / 100;

    const ip = server.ip_address && server.ip_address !== '0.0.0.0' ? server.ip_address : '127.0.0.1';
    const address = `${ip}:${server.port}`;

    let usedRamBytes: number | null = 0;
    let ramPercent: number | null = 0;
    let cpuPercent: number | null = 0;

    const isRunningState = ['online', 'starting', 'stopping'].includes(server.status);

    if (isRunningState && pid && this.isPidAlive(pid)) {
      const usage = this.getPidUsage(pid);
      usedRamBytes = usage.usedBytes;
      cpuPercent = usage.cpuPercent;

      if (usedRamBytes !== null) {
        ramPercent = Math.min(100, Math.round((usedRamBytes / limitRamBytes) * 1000) / 10);
      } else {
        ramPercent = null;
      }
    } else if (server.status === 'offline' || server.status === 'installing' || server.status === 'failed') {
      usedRamBytes = 0;
      ramPercent = 0;
      cpuPercent = 0;
    } else {
      usedRamBytes = null;
      ramPercent = null;
      cpuPercent = null;
    }

    const usedDiskBytes = this.getDiskUsage(serverDir);
    let diskPercent: number | null = null;
    if (usedDiskBytes !== null && limitDiskBytes) {
      diskPercent = Math.min(100, Math.round((usedDiskBytes / limitDiskBytes) * 1000) / 10);
    }

    return {
      status: server.status,
      cpu: {
        percent: cpuPercent,
        cores
      },
      memory: {
        usedBytes: usedRamBytes,
        limitBytes: limitRamBytes,
        percent: ramPercent
      },
      disk: {
        usedBytes: usedDiskBytes,
        limitBytes: limitDiskBytes,
        percent: diskPercent
      },
      address
    };
  }
}

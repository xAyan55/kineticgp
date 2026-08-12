import os from 'os';
import { execSync } from 'child_process';
import { NodeModel } from '../models/nodeModel';
import { NodeInfo } from '../types';

export class NodeService {
  private static cachedJavaVersion: string | null = null;

  static getJavaVersion(): string {
    if (this.cachedJavaVersion) return this.cachedJavaVersion;
    try {
      const output = execSync('java -version 2>&1', { encoding: 'utf-8' });
      const match = output.match(/version "([^"]+)"|openjdk ([0-9.]+)/i);
      this.cachedJavaVersion = match ? (match[1] || match[2]) : 'Java Detected';
    } catch {
      this.cachedJavaVersion = 'Not Installed / Not in PATH';
    }
    return this.cachedJavaVersion;
  }

  static getPM2Status(): string {
    try {
      const output = execSync('pm2 -v 2>&1', { encoding: 'utf-8' });
      return `Installed (v${output.trim()})`;
    } catch {
      return 'Not Installed / Single Node';
    }
  }

  private static prevCpuTimes: { idle: number; total: number } | null = null;

  static getSystemMetrics(): NodeInfo {
    const hostname = os.hostname();
    const platform = os.type();
    const kernel = os.release();
    const arch = os.arch();
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Generic CPU';
    const cpuCores = cpus.length || 1;

    const totalMem = Math.round(os.totalmem() / (1024 * 1024)); // MB
    const freeMem = Math.round(os.freemem() / (1024 * 1024)); // MB
    const usedMem = totalMem - freeMem;

    // Estimate CPU load from tick delta or loadavg
    let currentIdle = 0;
    let currentTotal = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        currentTotal += (cpu.times as any)[type];
      }
      currentIdle += cpu.times.idle;
    }

    let cpuUsage = 0;
    const loadavg = os.loadavg();
    if (loadavg && loadavg.length > 0 && loadavg[0] > 0) {
      cpuUsage = Math.min(100, Math.round((loadavg[0] / cpuCores) * 100));
    } else if (this.prevCpuTimes) {
      const idleDelta = currentIdle - this.prevCpuTimes.idle;
      const totalDelta = currentTotal - this.prevCpuTimes.total;
      if (totalDelta > 0) {
        cpuUsage = Math.max(0, Math.min(100, Math.round(100 - (100 * idleDelta / totalDelta))));
      } else {
        cpuUsage = 5;
      }
    } else {
      cpuUsage = 10; // Initial sample baseline
    }

    this.prevCpuTimes = { idle: currentIdle, total: currentTotal };
    if (isNaN(cpuUsage) || cpuUsage < 0) cpuUsage = 5;

    // Disk estimation (default 100 GB, used 25 GB)
    let diskTotal = 100;
    let diskUsed = 22.5;
    try {
      if (process.platform !== 'win32') {
        const df = execSync("df -BG / | tail -1 | awk '{print $2, $3}'", { encoding: 'utf-8' }).trim().split(/\s+/);
        if (df.length >= 2) {
          diskTotal = parseInt(df[0].replace('G', ''), 10) || 100;
          diskUsed = parseInt(df[1].replace('G', ''), 10) || 22.5;
        }
      }
    } catch {
      // fallback
    }

    const uptimeSeconds = os.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const mins = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeStr = `${days}d ${hours}h ${mins}m`;

    const localNode = NodeModel.upsertLocalNode({
      name: 'Local Node (Primary)',
      hostname,
      ip_address: '127.0.0.1',
      status: 'online',
      cpu_usage: cpuUsage,
      memory_usage: usedMem,
      memory_total: totalMem,
      disk_usage: diskUsed,
      disk_total: diskTotal
    });

    return {
      ...localNode,
      os_type: `${platform} (${os.platform()})`,
      kernel,
      arch,
      cpu_model: cpuModel,
      cpu_cores: cpuCores,
      uptime: uptimeStr,
      java_version: this.getJavaVersion(),
      pm2_status: this.getPM2Status()
    };
  }
}

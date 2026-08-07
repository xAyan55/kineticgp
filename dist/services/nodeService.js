"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeService = void 0;
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const nodeModel_1 = require("../models/nodeModel");
class NodeService {
    static cachedJavaVersion = null;
    static getJavaVersion() {
        if (this.cachedJavaVersion)
            return this.cachedJavaVersion;
        try {
            const output = (0, child_process_1.execSync)('java -version 2>&1', { encoding: 'utf-8' });
            const match = output.match(/version "([^"]+)"|openjdk ([0-9.]+)/i);
            this.cachedJavaVersion = match ? (match[1] || match[2]) : 'Java Detected';
        }
        catch {
            this.cachedJavaVersion = 'Not Installed / Not in PATH';
        }
        return this.cachedJavaVersion;
    }
    static getPM2Status() {
        try {
            const output = (0, child_process_1.execSync)('pm2 -v 2>&1', { encoding: 'utf-8' });
            return `Installed (v${output.trim()})`;
        }
        catch {
            return 'Not Installed / Single Node';
        }
    }
    static getSystemMetrics() {
        const hostname = os_1.default.hostname();
        const platform = os_1.default.type();
        const kernel = os_1.default.release();
        const arch = os_1.default.arch();
        const cpus = os_1.default.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'Generic CPU';
        const cpuCores = cpus.length;
        const totalMem = Math.round(os_1.default.totalmem() / (1024 * 1024)); // MB
        const freeMem = Math.round(os_1.default.freemem() / (1024 * 1024)); // MB
        const usedMem = totalMem - freeMem;
        // Estimate CPU load from loadavg or core times
        const loadavg = os_1.default.loadavg();
        let cpuUsage = 0;
        if (loadavg && loadavg.length > 0 && loadavg[0] > 0) {
            cpuUsage = Math.min(100, Math.round((loadavg[0] / cpuCores) * 100));
        }
        else {
            // Fallback calculation from CPU times
            let idle = 0;
            let total = 0;
            for (const cpu of cpus) {
                for (const type in cpu.times) {
                    total += cpu.times[type];
                }
                idle += cpu.times.idle;
            }
            cpuUsage = Math.round(100 - (100 * idle / total));
        }
        if (isNaN(cpuUsage) || cpuUsage < 0)
            cpuUsage = 15;
        // Disk estimation (default 100 GB, used 25 GB)
        let diskTotal = 100;
        let diskUsed = 22.5;
        try {
            if (process.platform !== 'win32') {
                const df = (0, child_process_1.execSync)("df -BG / | tail -1 | awk '{print $2, $3}'", { encoding: 'utf-8' }).trim().split(/\s+/);
                if (df.length >= 2) {
                    diskTotal = parseInt(df[0].replace('G', ''), 10) || 100;
                    diskUsed = parseInt(df[1].replace('G', ''), 10) || 22.5;
                }
            }
        }
        catch {
            // fallback
        }
        const uptimeSeconds = os_1.default.uptime();
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const mins = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeStr = `${days}d ${hours}h ${mins}m`;
        const localNode = nodeModel_1.NodeModel.upsertLocalNode({
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
            os_type: `${platform} (${os_1.default.platform()})`,
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
exports.NodeService = NodeService;

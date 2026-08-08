"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const events_1 = require("events");
const database_1 = require("../db/database");
const serverModel_1 = require("../models/serverModel");
class ProcessManager extends events_1.EventEmitter {
    static instance;
    activeProcesses = new Map();
    consoleLogsBuffer = new Map();
    serverIdCache = new Map();
    stopTimers = new Map();
    logQueue = [];
    logTimer = null;
    constructor() {
        super();
    }
    static getInstance() {
        if (!ProcessManager.instance) {
            ProcessManager.instance = new ProcessManager();
        }
        return ProcessManager.instance;
    }
    getServerId(serverUuid) {
        if (this.serverIdCache.has(serverUuid)) {
            return this.serverIdCache.get(serverUuid);
        }
        try {
            const server = serverModel_1.ServerModel.findByUuid(serverUuid);
            if (server) {
                this.serverIdCache.set(serverUuid, server.id);
                return server.id;
            }
        }
        catch { }
        return null;
    }
    queueDbLog(serverId, message) {
        this.logQueue.push({ serverId, message });
        if (!this.logTimer) {
            this.logTimer = setTimeout(() => {
                this.flushLogQueue();
            }, 100);
        }
    }
    flushLogQueue() {
        this.logTimer = null;
        if (this.logQueue.length === 0)
            return;
        const itemsToFlush = this.logQueue.splice(0, 100);
        try {
            const stmt = database_1.db.prepare('INSERT INTO server_logs (server_id, message) VALUES (?, ?)');
            const insertBatch = database_1.db.transaction((logs) => {
                for (const item of logs) {
                    stmt.run(item.serverId, item.message);
                }
            });
            insertBatch(itemsToFlush);
        }
        catch (e) {
            // Ignore background log write errors
        }
        if (this.logQueue.length > 0) {
            this.logTimer = setTimeout(() => this.flushLogQueue(), 100);
        }
    }
    // Append a console log line to buffer, DB, and emit live SSE event
    logOutput(serverUuid, message) {
        const cleanMsg = message.trim();
        if (!cleanMsg)
            return;
        if (!this.consoleLogsBuffer.has(serverUuid)) {
            this.consoleLogsBuffer.set(serverUuid, []);
        }
        const buffer = this.consoleLogsBuffer.get(serverUuid);
        buffer.push(cleanMsg);
        // Keep buffer capped at 500 lines for memory efficiency
        if (buffer.length > 500) {
            buffer.shift();
        }
        // Queue DB log write asynchronously to avoid blocking the event loop
        const serverId = this.getServerId(serverUuid);
        if (serverId) {
            this.queueDbLog(serverId, cleanMsg);
        }
        // Emit live SSE event for subscribers
        this.emit(`console:${serverUuid}`, cleanMsg);
    }
    getConsoleLogs(serverUuid) {
        if (this.consoleLogsBuffer.has(serverUuid)) {
            return this.consoleLogsBuffer.get(serverUuid);
        }
        try {
            const serverId = this.getServerId(serverUuid);
            if (serverId) {
                const rows = database_1.db.prepare('SELECT message FROM server_logs WHERE server_id = ? ORDER BY id DESC LIMIT 200').all(serverId);
                const logs = rows.map(r => r.message).reverse();
                this.consoleLogsBuffer.set(serverUuid, logs);
                return logs;
            }
        }
        catch { }
        return [];
    }
    isPidAlive(pid) {
        if (!pid || pid <= 0)
            return false;
        try {
            process.kill(pid, 0);
            return true;
        }
        catch {
            return false;
        }
    }
    isProcessRunning(serverUuid) {
        const proc = this.activeProcesses.get(serverUuid);
        if (proc && proc.pid && !proc.killed && this.isPidAlive(proc.pid)) {
            return true;
        }
        // Fallback: Check PID stored in database (e.g. after Node restart)
        try {
            const server = serverModel_1.ServerModel.findByUuid(serverUuid);
            if (server && server.pid && this.isPidAlive(server.pid)) {
                if (server.status === 'online' || server.status === 'starting' || server.status === 'stopping') {
                    return true;
                }
            }
        }
        catch { }
        return false;
    }
    getTimeStamp() {
        const d = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    clearStopTimer(serverUuid) {
        if (this.stopTimers.has(serverUuid)) {
            clearTimeout(this.stopTimers.get(serverUuid));
            this.stopTimers.delete(serverUuid);
        }
    }
    startServer(server) {
        this.clearStopTimer(server.uuid);
        if (this.isProcessRunning(server.uuid)) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Java process is already active.`);
            return false;
        }
        const workingDir = server.directory || path_1.default.join(process.cwd(), 'storage', 'servers', server.uuid);
        const jarPath = path_1.default.join(workingDir, server.jar_file || 'server.jar');
        if (!fs_1.default.existsSync(jarPath)) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Jar file not found at ${jarPath}. Reinstall server jar.`);
            serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
            this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
            return false;
        }
        // Build startup arguments with safety limits
        const xmx = Math.min(server.ram_limit || 2048, 8192);
        const args = [
            `-Xms128M`,
            `-Xmx${xmx}M`,
            `-Dfile.encoding=UTF-8`,
            `-jar`,
            server.jar_file || 'server.jar',
            `--nogui`
        ];
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Starting Java process (${server.software} ${server.version})...`);
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Directory: ${workingDir}`);
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Command: java ${args.join(' ')}`);
        let child;
        try {
            child = (0, child_process_1.spawn)('java', args, {
                cwd: workingDir,
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe']
            });
        }
        catch (e) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Launch failed: ${e.message}`);
            serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
            this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
            return false;
        }
        // Protect all child streams against unhandled error events
        child.stdin?.on('error', (err) => {
            console.warn(`[ProcessManager] stdin stream error (${server.uuid}):`, err.message);
        });
        child.stdout?.on('error', (err) => {
            console.warn(`[ProcessManager] stdout stream error (${server.uuid}):`, err.message);
        });
        child.stderr?.on('error', (err) => {
            console.warn(`[ProcessManager] stderr stream error (${server.uuid}):`, err.message);
        });
        child.on('error', (err) => {
            this.clearStopTimer(server.uuid);
            this.activeProcesses.delete(server.uuid);
            serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
            this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
            if (err.code === 'ENOENT') {
                this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] ❌ Java runtime binary ("java") was not found on the host system.`);
            }
            else {
                this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Process launch error: ${err.message}`);
            }
        });
        if (!child.pid) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Failed to obtain Java process PID.`);
            serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
            this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
            return false;
        }
        this.activeProcesses.set(server.uuid, child);
        serverModel_1.ServerModel.updateRuntimeState(server.id, 'online', child.pid);
        child.stdout?.on('data', (data) => {
            const text = data.toString('utf-8');
            const lines = text.split(/\r?\n/);
            for (const line of lines) {
                if (line.trim())
                    this.logOutput(server.uuid, line);
            }
        });
        child.stderr?.on('data', (data) => {
            const text = data.toString('utf-8');
            const lines = text.split(/\r?\n/);
            for (const line of lines) {
                if (line.trim())
                    this.logOutput(server.uuid, `[WARN] ${line}`);
            }
        });
        child.on('close', (code) => {
            this.clearStopTimer(server.uuid);
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Java process terminated with exit code: ${code}`);
            this.activeProcesses.delete(server.uuid);
            serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
            this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
        });
        this.emit(`status:${server.uuid}`, { status: 'online', pid: child.pid });
        return true;
    }
    stopServer(server) {
        this.clearStopTimer(server.uuid);
        const child = this.activeProcesses.get(server.uuid);
        const targetPid = child?.pid || server.pid;
        if (!targetPid || !this.isPidAlive(targetPid)) {
            serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
            this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
            return false;
        }
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Sending "stop" command to Java process STDIN...`);
        serverModel_1.ServerModel.updateRuntimeState(server.id, 'stopping', targetPid);
        this.emit(`status:${server.uuid}`, { status: 'stopping', pid: targetPid });
        let sentStdin = false;
        if (child && child.stdin && !child.stdin.destroyed) {
            try {
                child.stdin.write('stop\n');
                sentStdin = true;
            }
            catch (err) {
                console.warn(`[ProcessManager] Write to stdin failed: ${err.message}`);
            }
        }
        if (!sentStdin && targetPid) {
            try {
                process.kill(targetPid, 'SIGTERM');
            }
            catch (err) {
                console.warn(`[ProcessManager] SIGTERM to PID ${targetPid} failed: ${err.message}`);
            }
        }
        // Schedule 10-second graceful stop fallback timer
        const timer = setTimeout(() => {
            this.stopTimers.delete(server.uuid);
            if (this.isProcessRunning(server.uuid)) {
                this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Graceful stop timeout. Sending SIGTERM to PID ${targetPid}...`);
                try {
                    process.kill(targetPid, 'SIGTERM');
                }
                catch { }
                // Secondary fallback: SIGKILL after 3 more seconds if still alive
                setTimeout(() => {
                    if (this.isProcessRunning(server.uuid)) {
                        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Process unresponsive. Force killing PID ${targetPid} (SIGKILL)...`);
                        this.killServer(server);
                    }
                }, 3000);
            }
        }, 10000);
        this.stopTimers.set(server.uuid, timer);
        return true;
    }
    restartServer(server) {
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Restarting server instance...`);
        if (this.isProcessRunning(server.uuid)) {
            this.stopServer(server);
            // Poll every second until process terminates or max 12 seconds
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (!this.isProcessRunning(server.uuid) || attempts >= 12) {
                    clearInterval(checkInterval);
                    if (this.isProcessRunning(server.uuid)) {
                        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Restart force killing lingering process...`);
                        this.killServer(server);
                    }
                    setTimeout(() => {
                        const freshServer = serverModel_1.ServerModel.findById(server.id) || server;
                        this.startServer(freshServer);
                    }, 1000);
                }
            }, 1000);
            return true;
        }
        else {
            return this.startServer(server);
        }
    }
    killServer(server) {
        this.clearStopTimer(server.uuid);
        const child = this.activeProcesses.get(server.uuid);
        const targetPid = child?.pid || server.pid;
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Force killing Java process (SIGKILL)...`);
        if (child) {
            try {
                child.kill('SIGKILL');
            }
            catch { }
            this.activeProcesses.delete(server.uuid);
        }
        if (targetPid && this.isPidAlive(targetPid)) {
            try {
                process.kill(targetPid, 'SIGKILL');
            }
            catch { }
            try {
                (0, child_process_1.execSync)(`kill -9 ${targetPid} 2>/dev/null || true`);
            }
            catch { }
        }
        serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
        this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
        return true;
    }
    sendCommand(server, command) {
        const child = this.activeProcesses.get(server.uuid);
        if (!child || !child.pid || !child.stdin || child.stdin.destroyed) {
            return false;
        }
        const cleanCmd = command.trim();
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [Command] > ${cleanCmd}`);
        try {
            child.stdin.write(`${cleanCmd}\n`);
            return true;
        }
        catch {
            return false;
        }
    }
    getLiveMetrics(server) {
        const isRunning = this.isProcessRunning(server.uuid);
        const dbServer = serverModel_1.ServerModel.findById(server.id) || server;
        const currentStatus = dbServer.status;
        if (!isRunning) {
            return {
                isRunning: false,
                status: currentStatus === 'online' ? 'offline' : currentStatus,
                cpuText: 'Not Running',
                ramText: 'Waiting for Java process...',
                playersText: 'No players online',
                cpuVal: 0,
                ramValMb: 0
            };
        }
        return {
            isRunning: true,
            status: currentStatus || 'online',
            cpuText: '12%',
            ramText: '380 MB',
            playersText: '0 players',
            cpuVal: 12,
            ramValMb: 380
        };
    }
}
exports.ProcessManager = ProcessManager;

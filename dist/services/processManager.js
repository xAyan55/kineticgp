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
const metricsService_1 = require("./metricsService");
class ProcessManager extends events_1.EventEmitter {
    static instance;
    activeProcesses = new Map();
    consoleLogsBuffer = new Map();
    serverIdCache = new Map();
    stopTimers = new Map();
    // Partial line buffers for stdout/stderr (chunks may not end on \n)
    stdoutBuffers = new Map();
    stderrBuffers = new Map();
    // Monotonically increasing event ID per server
    eventCounters = new Map();
    logQueue = [];
    logTimer = null;
    static MAX_REPLAY_BUFFER = 2000;
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
    nextEventId(serverUuid) {
        const current = this.eventCounters.get(serverUuid) || 0;
        const next = current + 1;
        this.eventCounters.set(serverUuid, next);
        return next;
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
    // Create a structured ConsoleEvent and emit it
    logOutput(serverUuid, message, type = 'stdout') {
        const cleanMsg = message.trimEnd();
        if (!cleanMsg)
            return;
        const evt = {
            id: this.nextEventId(serverUuid),
            timestamp: new Date().toISOString(),
            type,
            line: cleanMsg
        };
        // Push to replay buffer
        if (!this.consoleLogsBuffer.has(serverUuid)) {
            this.consoleLogsBuffer.set(serverUuid, []);
        }
        const buffer = this.consoleLogsBuffer.get(serverUuid);
        buffer.push(evt);
        // Cap replay buffer
        while (buffer.length > ProcessManager.MAX_REPLAY_BUFFER) {
            buffer.shift();
        }
        // Queue DB log write asynchronously
        const serverId = this.getServerId(serverUuid);
        if (serverId) {
            this.queueDbLog(serverId, cleanMsg);
        }
        // Emit structured event for SSE subscribers
        this.emit(`console:${serverUuid}`, evt);
    }
    // Get recent console history as structured events
    getConsoleHistory(serverUuid) {
        if (this.consoleLogsBuffer.has(serverUuid)) {
            return this.consoleLogsBuffer.get(serverUuid);
        }
        // Fallback: load from DB
        try {
            const serverId = this.getServerId(serverUuid);
            if (serverId) {
                const rows = database_1.db.prepare('SELECT message FROM server_logs WHERE server_id = ? ORDER BY id DESC LIMIT 200').all(serverId);
                const events = rows.map(r => r.message).reverse().map(line => ({
                    id: this.nextEventId(serverUuid),
                    timestamp: new Date().toISOString(),
                    type: 'stdout',
                    line
                }));
                this.consoleLogsBuffer.set(serverUuid, events);
                return events;
            }
        }
        catch { }
        return [];
    }
    // Get events after a given event ID for SSE reconnection replay
    getEventsSince(serverUuid, lastEventId) {
        const buffer = this.consoleLogsBuffer.get(serverUuid);
        if (!buffer || buffer.length === 0)
            return [];
        // Find events with id > lastEventId
        const idx = buffer.findIndex(e => e.id > lastEventId);
        if (idx === -1)
            return [];
        return buffer.slice(idx);
    }
    // Legacy compat: return string array for initial page render
    getConsoleLogs(serverUuid) {
        const history = this.getConsoleHistory(serverUuid);
        return history.map(e => e.line);
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
    // Process stdout/stderr chunks with proper partial line buffering
    processStreamChunk(serverUuid, data, bufferMap, type) {
        const text = data.toString('utf-8');
        const existing = bufferMap.get(serverUuid) || '';
        const combined = existing + text;
        const lines = combined.split(/\r?\n/);
        // Last element is either empty (if chunk ended with \n) or a partial line
        const remainder = lines.pop() || '';
        bufferMap.set(serverUuid, remainder);
        for (const line of lines) {
            if (line.trim()) {
                this.logOutput(serverUuid, line, type);
            }
        }
    }
    // Flush remaining partial line from buffer (called on process exit)
    flushStreamBuffer(serverUuid, bufferMap, type) {
        const remainder = bufferMap.get(serverUuid);
        if (remainder && remainder.trim()) {
            this.logOutput(serverUuid, remainder, type);
        }
        bufferMap.delete(serverUuid);
    }
    startServer(server) {
        this.clearStopTimer(server.uuid);
        if (this.isProcessRunning(server.uuid)) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Java process is already active.`, 'system');
            return false;
        }
        const workingDir = server.directory || path_1.default.join(process.cwd(), 'storage', 'servers', server.uuid);
        const jarPath = path_1.default.join(workingDir, server.jar_file || 'server.jar');
        if (!fs_1.default.existsSync(jarPath)) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Jar file not found at ${jarPath}. Reinstall server jar.`, 'system');
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
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Starting Java process (${server.software} ${server.version})...`, 'system');
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Directory: ${workingDir}`, 'system');
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Command: java ${args.join(' ')}`, 'system');
        let child;
        try {
            child = (0, child_process_1.spawn)('java', args, {
                cwd: workingDir,
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe']
            });
        }
        catch (e) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Launch failed: ${e.message}`, 'system');
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
                this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Java runtime binary ("java") was not found on the host system.`, 'system');
            }
            else {
                this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Process launch error: ${err.message}`, 'system');
            }
        });
        if (!child.pid) {
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [ERROR] Failed to obtain Java process PID.`, 'system');
            serverModel_1.ServerModel.updateRuntimeState(server.id, 'offline', null);
            this.emit(`status:${server.uuid}`, { status: 'offline', pid: null });
            return false;
        }
        this.activeProcesses.set(server.uuid, child);
        serverModel_1.ServerModel.updateRuntimeState(server.id, 'online', child.pid);
        // Clear any stale partial line buffers
        this.stdoutBuffers.delete(server.uuid);
        this.stderrBuffers.delete(server.uuid);
        // Attach stdout/stderr with proper partial line buffering
        child.stdout?.on('data', (data) => {
            this.processStreamChunk(server.uuid, data, this.stdoutBuffers, 'stdout');
        });
        child.stderr?.on('data', (data) => {
            this.processStreamChunk(server.uuid, data, this.stderrBuffers, 'stderr');
        });
        child.on('close', (code) => {
            this.clearStopTimer(server.uuid);
            // Flush any remaining partial line data
            this.flushStreamBuffer(server.uuid, this.stdoutBuffers, 'stdout');
            this.flushStreamBuffer(server.uuid, this.stderrBuffers, 'stderr');
            this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Java process terminated with exit code: ${code}`, 'system');
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
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Sending "stop" command to Java process STDIN...`, 'system');
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
                this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Graceful stop timeout. Sending SIGTERM to PID ${targetPid}...`, 'system');
                try {
                    process.kill(targetPid, 'SIGTERM');
                }
                catch { }
                // Secondary fallback: SIGKILL after 3 more seconds if still alive
                setTimeout(() => {
                    if (this.isProcessRunning(server.uuid)) {
                        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Process unresponsive. Force killing PID ${targetPid} (SIGKILL)...`, 'system');
                        this.killServer(server);
                    }
                }, 3000);
            }
        }, 10000);
        this.stopTimers.set(server.uuid, timer);
        return true;
    }
    restartServer(server) {
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Restarting server instance...`, 'system');
        if (this.isProcessRunning(server.uuid)) {
            this.stopServer(server);
            // Poll every second until process terminates or max 12 seconds
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (!this.isProcessRunning(server.uuid) || attempts >= 12) {
                    clearInterval(checkInterval);
                    if (this.isProcessRunning(server.uuid)) {
                        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Restart force killing lingering process...`, 'system');
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
        this.logOutput(server.uuid, `[${this.getTimeStamp()}] [System] Force killing Java process (SIGKILL)...`, 'system');
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
        // Flush remaining partial line buffers
        this.flushStreamBuffer(server.uuid, this.stdoutBuffers, 'stdout');
        this.flushStreamBuffer(server.uuid, this.stderrBuffers, 'stderr');
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
        this.logOutput(server.uuid, `> ${cleanCmd}`, 'command');
        try {
            child.stdin.write(`${cleanCmd}\n`);
            return true;
        }
        catch {
            return false;
        }
    }
    getLiveMetrics(server) {
        const dbServer = serverModel_1.ServerModel.findById(server.id) || server;
        const child = this.activeProcesses.get(server.uuid);
        const targetPid = child?.pid || dbServer.pid;
        return metricsService_1.MetricsService.getServerMetrics(dbServer, targetPid ?? null);
    }
}
exports.ProcessManager = ProcessManager;

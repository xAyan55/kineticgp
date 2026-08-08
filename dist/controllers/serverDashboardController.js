"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerDashboardController = exports.fileUpload = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const serverModel_1 = require("../models/serverModel");
const userModel_1 = require("../models/userModel");
const processManager_1 = require("../services/processManager");
const fileManagerService_1 = require("../services/fileManagerService");
const installationWorker_1 = require("../services/installationWorker");
const activityModel_1 = require("../models/activityModel");
const settingModel_1 = require("../models/settingModel");
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const uuid = String(req.params.uuid);
        const server = serverModel_1.ServerModel.findByUuid(uuid);
        const subPath = String(req.body?.path || req.query?.path || '');
        if (server) {
            const targetDir = fileManagerService_1.FileManagerService.getSanitizedPath(server, subPath);
            cb(null, targetDir);
        }
        else {
            cb(null, path_1.default.join(process.cwd(), 'storage'));
        }
    },
    filename: (_req, file, cb) => {
        cb(null, file.originalname);
    }
});
exports.fileUpload = (0, multer_1.default)({ storage });
class ServerDashboardController {
    static authorizeServerAccess(req, res) {
        const isJson = req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (!req.session || !req.session.userId) {
            if (isJson) {
                res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
                return null;
            }
            res.redirect('/login');
            return null;
        }
        const user = userModel_1.UserModel.findById(req.session.userId);
        if (!user || user.status === 'suspended') {
            if (isJson) {
                res.status(403).json({ success: false, error: 'ACCOUNT_SUSPENDED' });
                return null;
            }
            res.redirect('/login?err=account_suspended');
            return null;
        }
        const uuid = String(req.params.uuid);
        const server = serverModel_1.ServerModel.findByUuid(uuid);
        if (!server) {
            if (isJson) {
                res.status(404).json({ success: false, error: 'SERVER_NOT_FOUND' });
                return null;
            }
            res.status(404).render('landing', {
                title: 'Server Not Found',
                siteTitle: 'KineticGP Panel',
                siteDescription: 'The requested server UUID does not exist.',
                user
            });
            return null;
        }
        // Access check: Only owner or admin/superadmin can access
        if (server.user_id !== user.id && user.role !== 'admin' && user.role !== 'superadmin') {
            if (isJson) {
                res.status(403).json({ success: false, error: 'FORBIDDEN' });
                return null;
            }
            res.status(403).render('errors/403', {
                title: '403 Forbidden — Server Access Denied',
                user
            });
            return null;
        }
        return { user, server };
    }
    // Redirect /dashboard/server/:uuid -> /console
    static getIndex(req, res) {
        const uuid = String(req.params.uuid);
        res.redirect(`/dashboard/server/${uuid}/console`);
    }
    // ── Console Page ───────────────────────────────────────────────────
    static getConsole(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const processMgr = processManager_1.ProcessManager.getInstance();
        const logs = processMgr.getConsoleLogs(server.uuid);
        const metrics = processMgr.getLiveMetrics(server);
        const settings = settingModel_1.SettingModel.getAll();
        res.render('server/console', {
            title: `${server.name} — Console`,
            user,
            server,
            logs,
            metrics,
            settings,
            msg: req.query.msg || null,
            err: req.query.err || null
        });
    }
    // SSE Stream for Real-Time Console & Metrics
    static streamConsoleSSE(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { server } = auth;
        const processMgr = processManager_1.ProcessManager.getInstance();
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const consoleListener = (logLine) => {
            res.write(`event: log\ndata: ${JSON.stringify({ message: logLine })}\n\n`);
        };
        const progressListener = (progData) => {
            res.write(`event: progress\ndata: ${JSON.stringify(progData)}\n\n`);
        };
        processMgr.on(`console:${server.uuid}`, consoleListener);
        processMgr.on(`progress:${server.uuid}`, progressListener);
        // Send metrics ticker every 3 seconds
        const interval = setInterval(() => {
            const metrics = processMgr.getLiveMetrics(server);
            res.write(`event: metrics\ndata: ${JSON.stringify(metrics)}\n\n`);
        }, 3000);
        req.on('close', () => {
            processMgr.off(`console:${server.uuid}`, consoleListener);
            processMgr.off(`progress:${server.uuid}`, progressListener);
            clearInterval(interval);
            res.end();
        });
    }
    // Server Power Actions (Start, Stop, Restart, Kill)
    static postPowerAction(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const action = String(req.body.action || '');
        const processMgr = processManager_1.ProcessManager.getInstance();
        let success = false;
        let logMsg = '';
        if (action === 'start') {
            if (processMgr.isProcessRunning(server.uuid)) {
                logMsg = 'Server is already running.';
                success = false;
            }
            else {
                success = processMgr.startServer(server);
                logMsg = success ? `Started server "${server.name}"` : `Failed to start server "${server.name}"`;
            }
        }
        else if (action === 'stop') {
            success = processMgr.stopServer(server);
            logMsg = success ? `Stopped server "${server.name}"` : `Server is not running.`;
        }
        else if (action === 'restart') {
            success = processMgr.restartServer(server);
            logMsg = `Restarted server "${server.name}"`;
        }
        else if (action === 'kill') {
            success = processMgr.killServer(server);
            logMsg = `Force killed server "${server.name}"`;
        }
        if (success) {
            activityModel_1.ActivityModel.log(user.id, user.username, `SERVER_${action.toUpperCase()}`, logMsg, req.ip || '127.0.0.1');
        }
        // Persist session before responding
        if (req.session) {
            req.session.save(() => { });
        }
        const isJson = req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (isJson) {
            const updatedServer = serverModel_1.ServerModel.findById(server.id) || server;
            res.json({
                success,
                message: logMsg,
                status: updatedServer.status
            });
            return;
        }
        res.redirect(`/dashboard/server/${server.uuid}/console`);
    }
    // Send Command to Server STDIN
    static postSendCommand(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { server } = auth;
        const command = String(req.body.command || '');
        const processMgr = processManager_1.ProcessManager.getInstance();
        const ok = processMgr.sendCommand(server, command);
        if (req.xhr || req.headers.accept?.includes('json')) {
            res.json({ success: ok });
            return;
        }
        res.redirect(`/dashboard/server/${server.uuid}/console`);
    }
    // ── Files Page ─────────────────────────────────────────────────────
    static getFiles(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const subPath = String(req.query.path || '/');
        const fileData = fileManagerService_1.FileManagerService.listFiles(server, subPath);
        const settings = settingModel_1.SettingModel.getAll();
        res.render('server/files', {
            title: `${server.name} — File Manager`,
            user,
            server,
            fileData,
            currentPath: fileData.currentPath,
            settings,
            msg: req.query.msg || null,
            err: req.query.err || null
        });
    }
    // Read File for Editor
    static getEditFile(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const filePath = String(req.query.path || '');
        const settings = settingModel_1.SettingModel.getAll();
        try {
            const content = fileManagerService_1.FileManagerService.readFile(server, filePath);
            const filename = path_1.default.basename(filePath);
            res.render('server/file-edit', {
                title: `Editing ${filename} — ${server.name}`,
                user,
                server,
                filePath,
                filename,
                content,
                settings,
                msg: req.query.msg || null,
                err: req.query.err || null
            });
        }
        catch (e) {
            res.redirect(`/dashboard/server/${server.uuid}/files?err=${encodeURIComponent(e.message)}`);
        }
    }
    // Save File Content
    static postSaveFile(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const { filePath, content } = req.body;
        try {
            fileManagerService_1.FileManagerService.saveFile(server, String(filePath), String(content));
            activityModel_1.ActivityModel.log(user.id, user.username, 'FILE_SAVE', `Saved file "${filePath}" on server "${server.name}"`, req.ip || '127.0.0.1');
            if (req.xhr || req.headers.accept?.includes('json')) {
                res.json({ success: true });
                return;
            }
            res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(path_1.default.dirname(filePath))}&msg=file_saved`);
        }
        catch (e) {
            res.redirect(`/dashboard/server/${server.uuid}/files?err=${encodeURIComponent(e.message)}`);
        }
    }
    // Create Folder / File
    static postCreateItem(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { server } = auth;
        const { path: subPath, name, type } = req.body;
        if (type === 'folder') {
            fileManagerService_1.FileManagerService.createFolder(server, String(subPath), String(name));
        }
        else {
            fileManagerService_1.FileManagerService.createFile(server, String(subPath), String(name));
        }
        res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(subPath)}&msg=created`);
    }
    // Rename File/Folder
    static postRenameItem(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { server } = auth;
        const { oldPath, newName } = req.body;
        fileManagerService_1.FileManagerService.renameItem(server, String(oldPath), String(newName));
        const parentDir = path_1.default.dirname(String(oldPath));
        res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(parentDir)}&msg=renamed`);
    }
    // Delete File/Folder
    static postDeleteItem(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { server } = auth;
        const { path: subPath } = req.body;
        fileManagerService_1.FileManagerService.deleteItem(server, String(subPath));
        const parentDir = path_1.default.dirname(String(subPath));
        res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(parentDir)}&msg=deleted`);
    }
    // Upload File
    static postUploadFile(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { server } = auth;
        const subPath = String(req.body.path || req.query.path || '/');
        res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(subPath)}&msg=uploaded`);
    }
    // Download File
    static getDownloadFile(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { server } = auth;
        const subPath = String(req.query.path || '');
        const fullPath = fileManagerService_1.FileManagerService.getSanitizedPath(server, subPath);
        if (fs_1.default.existsSync(fullPath) && !fs_1.default.statSync(fullPath).isDirectory()) {
            res.download(fullPath);
        }
        else {
            res.redirect(`/dashboard/server/${server.uuid}/files?err=file_not_found`);
        }
    }
    // ── Settings Page ──────────────────────────────────────────────────
    static getSettings(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const settings = settingModel_1.SettingModel.getAll();
        res.render('server/settings', {
            title: `${server.name} — Settings`,
            user,
            server,
            settings,
            msg: req.query.msg || null,
            err: req.query.err || null
        });
    }
    // Save Settings / Reinstall
    static postSaveSettings(req, res) {
        const auth = ServerDashboardController.authorizeServerAccess(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const { name, description, ram_limit, version, software, startup_command, action } = req.body;
        if (action === 'reinstall') {
            serverModel_1.ServerModel.updateSettings(server.id, {
                version: String(version || server.version),
                software: String(software || server.software)
            });
            installationWorker_1.InstallationWorker.enqueue(server.uuid);
            activityModel_1.ActivityModel.log(user.id, user.username, 'SERVER_REINSTALL', `Queued server jar reinstallation for "${server.name}" to ${software} ${version}`, req.ip || '127.0.0.1');
            return res.redirect(`/dashboard/server/${server.uuid}/console`);
        }
        serverModel_1.ServerModel.updateSettings(server.id, {
            name: String(name || server.name).trim(),
            description: String(description || '').trim(),
            ram_limit: parseInt(String(ram_limit), 10) || server.ram_limit,
            startup_command: String(startup_command || server.startup_command).trim()
        });
        activityModel_1.ActivityModel.log(user.id, user.username, 'SERVER_SETTINGS_UPDATE', `Updated settings for server "${server.name}"`, req.ip || '127.0.0.1');
        res.redirect(`/dashboard/server/${server.uuid}/settings?msg=settings_saved`);
    }
}
exports.ServerDashboardController = ServerDashboardController;

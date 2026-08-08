import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { ServerModel } from '../models/serverModel';
import { UserModel } from '../models/userModel';
import { ProcessManager } from '../services/processManager';
import { FileManagerService } from '../services/fileManagerService';
import { MinecraftJarService } from '../services/minecraftJarService';
import { InstallationWorker } from '../services/installationWorker';
import { ActivityModel } from '../models/activityModel';
import { SettingModel } from '../models/settingModel';

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uuid = String(req.params.uuid);
    const server = ServerModel.findByUuid(uuid);
    const subPath = String(req.body?.path || req.query?.path || '');
    if (server) {
      const targetDir = FileManagerService.getSanitizedPath(server, subPath);
      cb(null, targetDir);
    } else {
      cb(null, path.join(process.cwd(), 'storage'));
    }
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  }
});
export const fileUpload = multer({ storage });

export class ServerDashboardController {

  private static authorizeServerAccess(req: Request, res: Response): { user: any; server: any } | null {
    const isJson = req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest';

    if (!req.session || !req.session.userId) {
      if (isJson) {
        res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
        return null;
      }
      res.redirect('/login');
      return null;
    }

    const user = UserModel.findById(req.session.userId);
    if (!user || user.status === 'suspended') {
      if (isJson) {
        res.status(403).json({ success: false, error: 'ACCOUNT_SUSPENDED' });
        return null;
      }
      res.redirect('/login?err=account_suspended');
      return null;
    }

    const uuid = String(req.params.uuid);
    const server = ServerModel.findByUuid(uuid);

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
  static getIndex(req: Request, res: Response): void {
    const uuid = String(req.params.uuid);
    res.redirect(`/dashboard/server/${uuid}/console`);
  }

  // ── Console Page ───────────────────────────────────────────────────
  static getConsole(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { user, server } = auth;
    const processMgr = ProcessManager.getInstance();
    const logs = processMgr.getConsoleLogs(server.uuid);
    const metrics = processMgr.getLiveMetrics(server);
    const settings = SettingModel.getAll();

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
  static streamConsoleSSE(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const processMgr = ProcessManager.getInstance();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const consoleListener = (logLine: string) => {
      res.write(`event: log\ndata: ${JSON.stringify({ message: logLine })}\n\n`);
    };

    const progressListener = (progData: any) => {
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
  static postPowerAction(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { user, server } = auth;
    const action = String(req.body.action || '');
    const processMgr = ProcessManager.getInstance();

    let success = false;
    let logMsg = '';

    if (action === 'start') {
      if (processMgr.isProcessRunning(server.uuid)) {
        logMsg = 'Server is already running.';
        success = false;
      } else {
        success = processMgr.startServer(server);
        logMsg = success ? `Started server "${server.name}"` : `Failed to start server "${server.name}"`;
      }
    } else if (action === 'stop') {
      success = processMgr.stopServer(server);
      logMsg = success ? `Stopped server "${server.name}"` : `Server is not running.`;
    } else if (action === 'restart') {
      success = processMgr.restartServer(server);
      logMsg = `Restarted server "${server.name}"`;
    } else if (action === 'kill') {
      success = processMgr.killServer(server);
      logMsg = `Force killed server "${server.name}"`;
    }

    if (success) {
      ActivityModel.log(user.id, user.username, `SERVER_${action.toUpperCase()}`, logMsg, req.ip || '127.0.0.1');
    }

    // Persist session before responding
    if (req.session) {
      req.session.save(() => {});
    }

    const isJson = req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isJson) {
      const updatedServer = ServerModel.findById(server.id) || server;
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
  static postSendCommand(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const command = String(req.body.command || '');
    const processMgr = ProcessManager.getInstance();

    const ok = processMgr.sendCommand(server, command);

    if (req.xhr || req.headers.accept?.includes('json')) {
      res.json({ success: ok });
      return;
    }
    res.redirect(`/dashboard/server/${server.uuid}/console`);
  }

  // ── Files Page ─────────────────────────────────────────────────────
  static getFiles(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { user, server } = auth;
    const subPath = String(req.query.path || '/');
    const fileData = FileManagerService.listFiles(server, subPath);
    const settings = SettingModel.getAll();

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

  // Detailed JSON endpoint for File Content API
  static getFileContent(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const filePath = String(req.query.path || '');

    try {
      const detail = FileManagerService.readFileDetailed(server, filePath);
      res.json({ success: true, ...detail });
    } catch (e: any) {
      const status = e.statusCode || 500;
      res.status(status).json({ success: false, error: e.message || 'FAILED_TO_READ_FILE' });
    }
  }

  // Read File for Editor Page
  static getEditFile(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { user, server } = auth;
    const filePath = String(req.query.path || '');
    const settings = SettingModel.getAll();

    try {
      const detail = FileManagerService.readFileDetailed(server, filePath);

      res.render('server/file-edit', {
        title: `Editing ${detail.filename} — ${server.name}`,
        user,
        server,
        filePath,
        filename: detail.filename,
        content: detail.content,
        mtimeMs: detail.mtimeMs,
        size: detail.size,
        isText: detail.isText,
        isTooLarge: detail.isTooLarge,
        mode: detail.mode,
        settings,
        msg: req.query.msg || null,
        err: req.query.err || null
      });
    } catch (e: any) {
      const status = e.statusCode || 500;
      if (req.xhr || req.headers.accept?.includes('json')) {
        res.status(status).json({ success: false, error: e.message });
        return;
      }
      res.redirect(`/dashboard/server/${server.uuid}/files?err=${encodeURIComponent(e.message)}`);
    }
  }

  // Atomic Save File Content
  static postSaveFile(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { user, server } = auth;
    const { filePath, content, expectedMtimeMs } = req.body;
    const isJson = req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest';

    try {
      const result = FileManagerService.saveFileAtomic(
        server,
        String(filePath || ''),
        String(content || ''),
        expectedMtimeMs ? Number(expectedMtimeMs) : undefined
      );

      ActivityModel.log(
        user.id,
        user.username,
        'FILE_EDIT',
        `Saved file "${filePath}" (${result.size} bytes) on server "${server.name}"`,
        req.ip || '127.0.0.1'
      );

      if (isJson) {
        res.json({
          success: true,
          message: 'File saved successfully.',
          mtimeMs: result.mtimeMs,
          size: result.size
        });
        return;
      }
      res.redirect(`/dashboard/server/${server.uuid}/files/edit?path=${encodeURIComponent(filePath)}&msg=file_saved`);
    } catch (e: any) {
      const status = e.statusCode || 500;
      if (isJson) {
        res.status(status).json({
          success: false,
          error: e.name || 'SAVE_FAILED',
          message: e.message,
          currentMtimeMs: e.currentMtimeMs || null
        });
        return;
      }
      res.redirect(`/dashboard/server/${server.uuid}/files/edit?path=${encodeURIComponent(filePath)}&err=${encodeURIComponent(e.message)}`);
    }
  }

  // Create Folder / File
  static postCreateItem(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const { path: subPath, name, type } = req.body;

    if (type === 'folder') {
      FileManagerService.createFolder(server, String(subPath), String(name));
    } else {
      FileManagerService.createFile(server, String(subPath), String(name));
    }

    res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(subPath)}&msg=created`);
  }

  // Rename File/Folder
  static postRenameItem(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const { oldPath, newName } = req.body;

    FileManagerService.renameItem(server, String(oldPath), String(newName));
    const parentDir = path.dirname(String(oldPath));
    res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(parentDir)}&msg=renamed`);
  }

  // Delete File/Folder
  static postDeleteItem(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const { path: subPath } = req.body;

    FileManagerService.deleteItem(server, String(subPath));
    const parentDir = path.dirname(String(subPath));
    res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(parentDir)}&msg=deleted`);
  }

  // Upload File
  static postUploadFile(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const subPath = String(req.body.path || req.query.path || '/');
    res.redirect(`/dashboard/server/${server.uuid}/files?path=${encodeURIComponent(subPath)}&msg=uploaded`);
  }

  // Download File
  static getDownloadFile(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { server } = auth;
    const subPath = String(req.query.path || '');
    const fullPath = FileManagerService.getSanitizedPath(server, subPath);

    if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
      res.download(fullPath);
    } else {
      res.redirect(`/dashboard/server/${server.uuid}/files?err=file_not_found`);
    }
  }

  // ── Settings Page ──────────────────────────────────────────────────
  static getSettings(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { user, server } = auth;
    const settings = SettingModel.getAll();

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
  static postSaveSettings(req: Request, res: Response): void {
    const auth = ServerDashboardController.authorizeServerAccess(req, res);
    if (!auth) return;

    const { user, server } = auth;
    const { name, description, ram_limit, version, software, startup_command, action } = req.body;

    if (action === 'reinstall') {
      ServerModel.updateSettings(server.id, {
        version: String(version || server.version),
        software: String(software || server.software)
      });

      InstallationWorker.enqueue(server.uuid);
      ActivityModel.log(user.id, user.username, 'SERVER_REINSTALL', `Queued server jar reinstallation for "${server.name}" to ${software} ${version}`, req.ip || '127.0.0.1');

      return res.redirect(`/dashboard/server/${server.uuid}/console`);
    }

    ServerModel.updateSettings(server.id, {
      name: String(name || server.name).trim(),
      description: String(description || '').trim(),
      ram_limit: parseInt(String(ram_limit), 10) || server.ram_limit,
      startup_command: String(startup_command || server.startup_command).trim()
    });

    ActivityModel.log(user.id, user.username, 'SERVER_SETTINGS_UPDATE', `Updated settings for server "${server.name}"`, req.ip || '127.0.0.1');

    res.redirect(`/dashboard/server/${server.uuid}/settings?msg=settings_saved`);
  }
}

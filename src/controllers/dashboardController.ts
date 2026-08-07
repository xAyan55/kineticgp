import { Request, Response } from 'express';
import { UserModel } from '../models/userModel';
import { ServerModel } from '../models/serverModel';
import { ActivityModel } from '../models/activityModel';

export class DashboardController {
  static getDashboard(req: Request, res: Response): void {
    const userId = req.session.userId!;
    const user = UserModel.findById(userId);

    if (!user) {
      req.session.destroy(() => {});
      return res.redirect('/login');
    }

    ServerModel.seedDemoServersIfEmpty(userId);
    ActivityModel.seedDemoLogsIfEmpty(userId, user.username);

    const servers = ServerModel.findByUserId(userId);
    const activityLogs = ActivityModel.getRecentByUserId(userId, 6);

    // Compute stats
    const totalServers = servers.length;
    const onlineServers = servers.filter(s => s.status === 'online').length;
    const totalPlayers = servers.reduce((acc, s) => acc + s.players_online, 0);
    const totalMemoryUsed = servers.reduce((acc, s) => acc + (s.status === 'online' ? s.memory_usage : 0), 0);
    const totalMemoryAllocated = servers.reduce((acc, s) => acc + s.max_memory, 0);
    const avgCpu = servers.length > 0 
      ? Math.round(servers.reduce((acc, s) => acc + (s.status === 'online' ? s.cpu_usage : 0), 0) / servers.length) 
      : 0;

    res.render('dashboard/index', {
      title: 'Dashboard',
      user,
      servers,
      activityLogs,
      stats: {
        totalServers,
        onlineServers,
        totalPlayers,
        totalMemoryUsed: (totalMemoryUsed / 1024).toFixed(1),
        totalMemoryAllocated: (totalMemoryAllocated / 1024).toFixed(1),
        avgCpu
      }
    });
  }

  static handleServerAction(req: Request, res: Response): void {
    const userId = req.session.userId!;
    const serverId = parseInt(String(req.params.id), 10);
    const action = String(req.body.action || ''); // 'start', 'stop', 'restart'

    const server = ServerModel.findById(serverId, userId);
    if (!server) {
      res.status(404).json({ success: false, message: 'Server not found' });
      return;
    }

    let targetStatus: 'online' | 'starting' | 'stopping' | 'offline' = 'online';
    let logMsg = '';

    if (action === 'start') {
      targetStatus = 'online';
      logMsg = `Started server "${server.name}"`;
    } else if (action === 'stop') {
      targetStatus = 'offline';
      logMsg = `Stopped server "${server.name}"`;
    } else if (action === 'restart') {
      targetStatus = 'online';
      logMsg = `Restarted server "${server.name}"`;
    } else {
      res.status(400).json({ success: false, message: 'Invalid action' });
      return;
    }

    ServerModel.updateStatus(serverId, userId, targetStatus);
    ActivityModel.log(userId, req.session.username!, action.toUpperCase(), logMsg);

    const updatedServer = ServerModel.findById(serverId, userId);

    res.json({
      success: true,
      message: logMsg,
      server: updatedServer
    });
  }
}

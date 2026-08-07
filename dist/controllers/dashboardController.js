"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const userModel_1 = require("../models/userModel");
const serverModel_1 = require("../models/serverModel");
const activityModel_1 = require("../models/activityModel");
const processManager_1 = require("../services/processManager");
class DashboardController {
    static getDashboard(req, res) {
        const userId = req.session.userId;
        const user = userModel_1.UserModel.findById(userId);
        if (!user) {
            req.session.destroy(() => { });
            return res.redirect('/login');
        }
        const servers = serverModel_1.ServerModel.findByUserId(userId);
        const activityLogs = activityModel_1.ActivityModel.getRecentByUserId(userId, 6);
        // Compute stats
        const totalServers = servers.length;
        const onlineServers = servers.filter(s => s.status === 'online').length;
        const totalPlayers = servers.reduce((acc, s) => acc + s.players_online, 0);
        const totalMemoryUsed = servers.reduce((acc, s) => acc + (s.status === 'online' ? s.memory_usage : 0), 0);
        const totalMemoryAllocated = servers.reduce((acc, s) => acc + s.ram_limit, 0);
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
    static handleServerAction(req, res) {
        const userId = req.session.userId;
        const serverId = parseInt(String(req.params.id), 10);
        const action = String(req.body.action || ''); // 'start', 'stop', 'restart'
        const server = serverModel_1.ServerModel.findById(serverId);
        if (!server || (server.user_id !== userId && req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            res.status(404).json({ success: false, message: 'Server not found' });
            return;
        }
        const processMgr = processManager_1.ProcessManager.getInstance();
        let success = false;
        let logMsg = '';
        if (action === 'start') {
            success = processMgr.startServer(server);
            logMsg = `Started server "${server.name}"`;
        }
        else if (action === 'stop') {
            success = processMgr.stopServer(server);
            logMsg = `Stopped server "${server.name}"`;
        }
        else if (action === 'restart') {
            success = processMgr.restartServer(server);
            logMsg = `Restarted server "${server.name}"`;
        }
        else {
            res.status(400).json({ success: false, message: 'Invalid action' });
            return;
        }
        if (success) {
            activityModel_1.ActivityModel.log(userId, req.session.username, action.toUpperCase(), logMsg, req.ip || '127.0.0.1');
        }
        const updatedServer = serverModel_1.ServerModel.findById(serverId);
        res.json({
            success,
            message: logMsg,
            server: updatedServer
        });
    }
}
exports.DashboardController = DashboardController;

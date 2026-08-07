"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const userModel_1 = require("../models/userModel");
const serverModel_1 = require("../models/serverModel");
const activityModel_1 = require("../models/activityModel");
class DashboardController {
    static getDashboard(req, res) {
        const userId = req.session.userId;
        const user = userModel_1.UserModel.findById(userId);
        if (!user) {
            req.session.destroy(() => { });
            return res.redirect('/login');
        }
        serverModel_1.ServerModel.seedDemoServersIfEmpty(userId);
        activityModel_1.ActivityModel.seedDemoLogsIfEmpty(userId, user.username);
        const servers = serverModel_1.ServerModel.findByUserId(userId);
        const activityLogs = activityModel_1.ActivityModel.getRecentByUserId(userId, 6);
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
    static handleServerAction(req, res) {
        const userId = req.session.userId;
        const serverId = parseInt(String(req.params.id), 10);
        const action = String(req.body.action || ''); // 'start', 'stop', 'restart'
        const server = serverModel_1.ServerModel.findById(serverId, userId);
        if (!server) {
            res.status(404).json({ success: false, message: 'Server not found' });
            return;
        }
        let targetStatus = 'online';
        let logMsg = '';
        if (action === 'start') {
            targetStatus = 'online';
            logMsg = `Started server "${server.name}"`;
        }
        else if (action === 'stop') {
            targetStatus = 'offline';
            logMsg = `Stopped server "${server.name}"`;
        }
        else if (action === 'restart') {
            targetStatus = 'online';
            logMsg = `Restarted server "${server.name}"`;
        }
        else {
            res.status(400).json({ success: false, message: 'Invalid action' });
            return;
        }
        serverModel_1.ServerModel.updateStatus(serverId, userId, targetStatus);
        activityModel_1.ActivityModel.log(userId, req.session.username, action.toUpperCase(), logMsg);
        const updatedServer = serverModel_1.ServerModel.findById(serverId, userId);
        res.json({
            success: true,
            message: logMsg,
            server: updatedServer
        });
    }
}
exports.DashboardController = DashboardController;

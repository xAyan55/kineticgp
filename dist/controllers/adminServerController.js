"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminServerController = void 0;
const serverModel_1 = require("../models/serverModel");
const userModel_1 = require("../models/userModel");
const installationWorker_1 = require("../services/installationWorker");
const activityModel_1 = require("../models/activityModel");
const settingModel_1 = require("../models/settingModel");
class AdminServerController {
    static getServers(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        if (!adminUser)
            return res.redirect('/login');
        const page = parseInt(String(req.query.page || '1'), 10);
        const limit = 10;
        const search = String(req.query.search || '').trim();
        const softwareFilter = String(req.query.software || '').trim();
        const statusFilter = String(req.query.status || '').trim();
        const sort = String(req.query.sort || '').trim();
        const servers = serverModel_1.ServerModel.findAll({ search, software: softwareFilter, status: statusFilter, sort, page, limit });
        const totalCount = serverModel_1.ServerModel.countFiltered({ search, software: softwareFilter, status: statusFilter });
        const totalPages = Math.ceil(totalCount / limit) || 1;
        const allUsers = userModel_1.UserModel.findAll();
        const settings = settingModel_1.SettingModel.getAll();
        res.render('admin/servers', {
            title: 'Server Management',
            user: adminUser,
            servers,
            allUsers,
            totalCount,
            page,
            totalPages,
            search,
            softwareFilter,
            statusFilter,
            sort,
            settings,
            msg: req.query.msg || null,
            err: req.query.err || null
        });
    }
    // GET /admin/servers/create (Dedicated Creation Page)
    static getCreateServer(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        if (!adminUser)
            return res.redirect('/login');
        const allUsers = userModel_1.UserModel.findAll();
        const settings = settingModel_1.SettingModel.getAll();
        res.render('admin/server-create', {
            title: 'Create Minecraft Server',
            user: adminUser,
            allUsers,
            settings,
            msg: req.query.msg || null,
            err: req.query.err || null
        });
    }
    // POST /admin/servers/create (Instant Creation & Background Queueing)
    static postCreateServer(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const { name, description, owner_id, version, software, java_version, ram_limit, cpu_limit, disk_limit } = req.body;
        if (!name || !owner_id) {
            return res.redirect('/admin/servers/create?err=missing_fields');
        }
        const ownerIdNum = parseInt(String(owner_id), 10);
        const owner = userModel_1.UserModel.findById(ownerIdNum);
        if (!owner) {
            return res.redirect('/admin/servers/create?err=owner_not_found');
        }
        const cleanVersion = String(version || '1.20.4').trim();
        const cleanSoftware = String(software || 'Paper').trim();
        const cleanJava = String(java_version || '21').trim();
        // 1. Instantly Create Database Record with status 'installing'
        const newServer = serverModel_1.ServerModel.create({
            user_id: ownerIdNum,
            name: String(name).trim(),
            description: String(description || '').trim(),
            version: cleanVersion,
            software: cleanSoftware,
            java_version: cleanJava,
            ram_limit: parseInt(String(ram_limit), 10) || 2048,
            cpu_limit: parseInt(String(cpu_limit), 10) || 100,
            disk_limit: parseInt(String(disk_limit), 10) || 10
        });
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_CREATE', `Created server "${newServer.name}" (UUID: ${newServer.uuid}) for user ${owner.username}`, req.ip || '127.0.0.1');
        // 2. Queue Background Installation Worker
        installationWorker_1.InstallationWorker.enqueue(newServer.uuid);
        // 3. Immediately redirect browser to the server console (< 30ms)
        res.redirect(`/dashboard/server/${newServer.uuid}/console`);
    }
    static postToggleSuspendServer(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const serverId = parseInt(String(req.params.id), 10);
        const server = serverModel_1.ServerModel.findById(serverId);
        if (!server) {
            return res.redirect('/admin/servers?err=server_not_found');
        }
        const newSuspended = server.suspended === 1 ? 0 : 1;
        serverModel_1.ServerModel.updateSuspended(serverId, newSuspended);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_SUSPEND', `${newSuspended === 1 ? 'Suspended' : 'Unsuspended'} server "${server.name}"`, req.ip || '127.0.0.1');
        res.redirect('/admin/servers?msg=server_updated');
    }
    static postChangeOwner(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const serverId = parseInt(String(req.params.id), 10);
        const { new_owner_id } = req.body;
        const server = serverModel_1.ServerModel.findById(serverId);
        if (!server)
            return res.redirect('/admin/servers?err=server_not_found');
        const newOwnerIdNum = parseInt(String(new_owner_id), 10);
        const newOwner = userModel_1.UserModel.findById(newOwnerIdNum);
        if (!newOwner)
            return res.redirect('/admin/servers?err=owner_not_found');
        serverModel_1.ServerModel.updateOwner(serverId, newOwnerIdNum);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_REOWN', `Reassigned server "${server.name}" to ${newOwner.username}`, req.ip || '127.0.0.1');
        res.redirect('/admin/servers?msg=owner_updated');
    }
    static postDeleteServer(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const serverId = parseInt(String(req.params.id), 10);
        const server = serverModel_1.ServerModel.findById(serverId);
        if (!server)
            return res.redirect('/admin/servers?err=server_not_found');
        serverModel_1.ServerModel.delete(serverId);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_DELETE', `Deleted server "${server.name}" (UUID: ${server.uuid})`, req.ip || '127.0.0.1');
        res.redirect('/admin/servers?msg=server_deleted');
    }
    static postRetryInstallation(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const serverId = parseInt(String(req.params.id), 10);
        const server = serverModel_1.ServerModel.findById(serverId);
        if (!server)
            return res.redirect('/admin/servers?err=server_not_found');
        installationWorker_1.InstallationWorker.retry(server.uuid);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_RETRY_INSTALL', `Retried installation for server "${server.name}"`, req.ip || '127.0.0.1');
        res.redirect(`/dashboard/server/${server.uuid}/console`);
    }
}
exports.AdminServerController = AdminServerController;

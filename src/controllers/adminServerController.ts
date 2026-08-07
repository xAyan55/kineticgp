import { Request, Response } from 'express';
import { ServerModel } from '../models/serverModel';
import { UserModel } from '../models/userModel';
import { MinecraftJarService } from '../services/minecraftJarService';
import { ActivityModel } from '../models/activityModel';
import { SettingModel } from '../models/settingModel';

export class AdminServerController {
  static getServers(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!);
    if (!adminUser) return res.redirect('/login');

    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = 10;
    const search = String(req.query.search || '').trim();
    const softwareFilter = String(req.query.software || '').trim();
    const statusFilter = String(req.query.status || '').trim();
    const sort = String(req.query.sort || '').trim();

    const servers = ServerModel.findAll({ search, software: softwareFilter, status: statusFilter, sort, page, limit });
    const totalCount = ServerModel.countFiltered({ search, software: softwareFilter, status: statusFilter });
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const allUsers = UserModel.findAll();
    const settings = SettingModel.getAll();

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

  static async postCreateServer(req: Request, res: Response): Promise<void> {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const { name, description, owner_id, version, software, java_version, ram_limit, cpu_limit, disk_limit } = req.body;

    if (!name || !owner_id) {
      return res.redirect('/admin/servers?err=missing_fields');
    }

    const ownerIdNum = parseInt(String(owner_id), 10);
    const owner = UserModel.findById(ownerIdNum);
    if (!owner) {
      return res.redirect('/admin/servers?err=owner_not_found');
    }

    const cleanVersion = String(version || '1.20.4').trim();
    const cleanSoftware = String(software || 'Paper').trim();
    const cleanJava = String(java_version || '21').trim();

    // 1. Create DB Record
    const newServer = ServerModel.create({
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

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_CREATE', `Created server "${newServer.name}" (UUID: ${newServer.uuid}) for user ${owner.username}`, req.ip || '127.0.0.1');

    // 2. Install Server JAR & Files asynchronously
    MinecraftJarService.installServer(newServer.uuid, cleanSoftware, cleanVersion, newServer.port, newServer.name)
      .then(() => {
        console.log(`✅ Background Jar install finished for ${newServer.name}`);
      })
      .catch((err) => {
        console.error(`❌ Background Jar install error for ${newServer.name}:`, err);
      });

    res.redirect('/admin/servers?msg=server_created');
  }

  static postToggleSuspendServer(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const serverId = parseInt(String(req.params.id), 10);
    const server = ServerModel.findById(serverId);

    if (!server) {
      return res.redirect('/admin/servers?err=server_not_found');
    }

    const newSuspended = server.suspended === 1 ? 0 : 1;
    ServerModel.updateSuspended(serverId, newSuspended);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_SUSPEND', `${newSuspended === 1 ? 'Suspended' : 'Unsuspended'} server "${server.name}"`, req.ip || '127.0.0.1');

    res.redirect('/admin/servers?msg=server_updated');
  }

  static postChangeOwner(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const serverId = parseInt(String(req.params.id), 10);
    const { new_owner_id } = req.body;

    const server = ServerModel.findById(serverId);
    if (!server) return res.redirect('/admin/servers?err=server_not_found');

    const newOwnerIdNum = parseInt(String(new_owner_id), 10);
    const newOwner = UserModel.findById(newOwnerIdNum);
    if (!newOwner) return res.redirect('/admin/servers?err=owner_not_found');

    ServerModel.updateOwner(serverId, newOwnerIdNum);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_REOWN', `Reassigned server "${server.name}" to ${newOwner.username}`, req.ip || '127.0.0.1');

    res.redirect('/admin/servers?msg=owner_updated');
  }

  static postDeleteServer(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const serverId = parseInt(String(req.params.id), 10);
    const server = ServerModel.findById(serverId);

    if (!server) return res.redirect('/admin/servers?err=server_not_found');

    ServerModel.delete(serverId);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SERVER_DELETE', `Deleted server "${server.name}" (UUID: ${server.uuid})`, req.ip || '127.0.0.1');

    res.redirect('/admin/servers?msg=server_deleted');
  }
}

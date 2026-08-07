import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import { UserModel } from '../models/userModel';
import { ServerModel } from '../models/serverModel';
import { NodeService } from '../services/nodeService';
import { PlanModel } from '../models/planModel';
import { SettingModel } from '../models/settingModel';
import { ActivityModel } from '../models/activityModel';

export class AdminController {
  // ── Overview ────────────────────────────────────────────────────────
  static getOverview(req: Request, res: Response): void {
    const user = UserModel.findById(req.session.userId!);
    if (!user) return res.redirect('/login');

    const totalUsers = UserModel.countAll();
    const activeUsers = UserModel.countActive();
    const suspendedUsers = UserModel.countSuspended();
    const totalServers = ServerModel.countAll();
    const onlineServers = ServerModel.countOnline();
    const offlineServers = ServerModel.countOffline();

    const node = NodeService.getSystemMetrics();
    const recentLogs = ActivityModel.findAll({ limit: 6 });
    const settings = SettingModel.getAll();

    res.render('admin/overview', {
      title: 'Admin Overview',
      user,
      settings,
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalServers,
        onlineServers,
        offlineServers,
        nodeCpu: node.cpu_usage,
        nodeRamUsed: (node.memory_usage / 1024).toFixed(1),
        nodeRamTotal: (node.memory_total / 1024).toFixed(1),
        nodeDiskUsed: node.disk_usage.toFixed(1),
        nodeDiskTotal: node.disk_total.toFixed(0),
        nodeStatus: node.status,
        uptime: node.uptime
      },
      recentLogs
    });
  }

  // ── Nodes Management ───────────────────────────────────────────────
  static getNodes(req: Request, res: Response): void {
    const user = UserModel.findById(req.session.userId!);
    if (!user) return res.redirect('/login');

    const node = NodeService.getSystemMetrics();
    const settings = SettingModel.getAll();

    res.render('admin/nodes', {
      title: 'Local Node Management',
      user,
      node,
      settings
    });
  }

  // ── Users Management ───────────────────────────────────────────────
  static getUsers(req: Request, res: Response): void {
    const user = UserModel.findById(req.session.userId!);
    if (!user) return res.redirect('/login');

    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = 10;
    const search = String(req.query.search || '').trim();
    const roleFilter = String(req.query.role || '').trim();
    const statusFilter = String(req.query.status || '').trim();

    const users = UserModel.findAll({ search, role: roleFilter, status: statusFilter, page, limit });
    const totalCount = UserModel.countFiltered({ search, role: roleFilter, status: statusFilter });
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const settings = SettingModel.getAll();

    res.render('admin/users', {
      title: 'User Management',
      user,
      users,
      totalCount,
      page,
      totalPages,
      search,
      roleFilter,
      statusFilter,
      settings,
      msg: req.query.msg || null,
      err: req.query.err || null
    });
  }

  static postCreateUser(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.redirect('/admin/users?err=missing_fields');
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    if (UserModel.findByUsername(cleanUsername)) {
      return res.redirect('/admin/users?err=username_exists');
    }

    if (UserModel.findByEmail(cleanEmail)) {
      return res.redirect('/admin/users?err=email_exists');
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const avatar = '/images/banners/big-steve-face.png';

    const newUser = UserModel.create({
      username: cleanUsername,
      email: cleanEmail,
      password_hash,
      avatar,
      role: role === 'superadmin' || role === 'admin' ? role : 'user'
    });

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_CREATE', `Created user "${newUser.username}" (${newUser.role})`, req.ip || '127.0.0.1');

    res.redirect('/admin/users?msg=user_created');
  }

  static postEditUser(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const userId = parseInt(String(req.params.id), 10);
    const { username, email } = req.body;

    const targetUser = UserModel.findById(userId);
    if (!targetUser) {
      return res.redirect('/admin/users?err=user_not_found');
    }

    if (username) UserModel.updateUsername(userId, String(username).trim());
    if (email) UserModel.updateEmail(userId, String(email).trim().toLowerCase());

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_EDIT', `Updated details for user "${targetUser.username}"`, req.ip || '127.0.0.1');

    res.redirect('/admin/users?msg=user_updated');
  }

  static postToggleSuspend(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const userId = parseInt(String(req.params.id), 10);

    if (userId === adminUser.id) {
      return res.redirect('/admin/users?err=cannot_suspend_self');
    }

    const targetUser = UserModel.findById(userId);
    if (!targetUser) {
      return res.redirect('/admin/users?err=user_not_found');
    }

    const newStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    UserModel.updateStatus(userId, newStatus);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_STATUS', `${newStatus === 'suspended' ? 'Suspended' : 'Unsuspended'} user "${targetUser.username}"`, req.ip || '127.0.0.1');

    res.redirect(`/admin/users?msg=user_${newStatus}`);
  }

  static postResetPassword(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const userId = parseInt(String(req.params.id), 10);
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.redirect('/admin/users?err=invalid_password');
    }

    const targetUser = UserModel.findById(userId);
    if (!targetUser) {
      return res.redirect('/admin/users?err=user_not_found');
    }

    const password_hash = bcrypt.hashSync(new_password, 10);
    UserModel.updatePassword(userId, password_hash);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_PASS_RESET', `Reset password for user "${targetUser.username}"`, req.ip || '127.0.0.1');

    res.redirect('/admin/users?msg=password_reset');
  }

  static postChangeRole(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const userId = parseInt(String(req.params.id), 10);
    const { role } = req.body;

    if (userId === adminUser.id && role !== adminUser.role) {
      return res.redirect('/admin/users?err=cannot_change_own_role');
    }

    const targetUser = UserModel.findById(userId);
    if (!targetUser) {
      return res.redirect('/admin/users?err=user_not_found');
    }

    if (targetUser.role === 'superadmin' && role !== 'superadmin' && UserModel.countSuperAdmins() <= 1) {
      return res.redirect('/admin/users?err=cannot_demote_last_superadmin');
    }

    UserModel.updateRole(userId, role);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_ROLE_CHANGE', `Changed role of "${targetUser.username}" to ${role}`, req.ip || '127.0.0.1');

    res.redirect('/admin/users?msg=role_updated');
  }

  static postDeleteUser(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const userId = parseInt(String(req.params.id), 10);

    if (userId === adminUser.id) {
      return res.redirect('/admin/users?err=cannot_delete_self');
    }

    const targetUser = UserModel.findById(userId);
    if (!targetUser) {
      return res.redirect('/admin/users?err=user_not_found');
    }

    if (targetUser.role === 'superadmin' && UserModel.countSuperAdmins() <= 1) {
      return res.redirect('/admin/users?err=cannot_delete_last_superadmin');
    }

    UserModel.softDelete(userId);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_DELETE', `Deleted user "${targetUser.username}"`, req.ip || '127.0.0.1');

    res.redirect('/admin/users?msg=user_deleted');
  }

  // ── Plans Management ───────────────────────────────────────────────
  static getPlans(req: Request, res: Response): void {
    const user = UserModel.findById(req.session.userId!);
    if (!user) return res.redirect('/login');

    const plans = PlanModel.findAll();
    const settings = SettingModel.getAll();

    res.render('admin/plans', {
      title: 'Plan Management',
      user,
      plans,
      settings,
      msg: req.query.msg || null,
      err: req.query.err || null
    });
  }

  static postCreatePlan(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const { name, description, memory_limit, cpu_limit, disk_limit, max_servers, max_backups, max_databases, max_allocations, price } = req.body;

    if (!name) {
      return res.redirect('/admin/plans?err=missing_name');
    }

    const plan = PlanModel.create({
      name: String(name).trim(),
      description: String(description || '').trim(),
      memory_limit: parseInt(String(memory_limit), 10) || 2048,
      cpu_limit: parseInt(String(cpu_limit), 10) || 100,
      disk_limit: parseInt(String(disk_limit), 10) || 10,
      max_servers: parseInt(String(max_servers), 10) || 1,
      max_backups: parseInt(String(max_backups), 10) || 3,
      max_databases: parseInt(String(max_databases), 10) || 1,
      max_allocations: parseInt(String(max_allocations), 10) || 3,
      price: parseFloat(String(price)) || 0.00
    });

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_CREATE', `Created plan "${plan.name}"`, req.ip || '127.0.0.1');

    res.redirect('/admin/plans?msg=plan_created');
  }

  static postEditPlan(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const planId = parseInt(String(req.params.id), 10);
    const { name, description, memory_limit, cpu_limit, disk_limit, max_servers, max_backups, max_databases, max_allocations, price, is_enabled } = req.body;

    PlanModel.update(planId, {
      name: String(name).trim(),
      description: String(description || '').trim(),
      memory_limit: parseInt(String(memory_limit), 10) || 2048,
      cpu_limit: parseInt(String(cpu_limit), 10) || 100,
      disk_limit: parseInt(String(disk_limit), 10) || 10,
      max_servers: parseInt(String(max_servers), 10) || 1,
      max_backups: parseInt(String(max_backups), 10) || 3,
      max_databases: parseInt(String(max_databases), 10) || 1,
      max_allocations: parseInt(String(max_allocations), 10) || 3,
      price: parseFloat(String(price)) || 0.00,
      is_enabled: is_enabled === 'on' || is_enabled === '1' || is_enabled === true ? 1 : 0
    });

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_EDIT', `Updated plan #${planId} "${name}"`, req.ip || '127.0.0.1');

    res.redirect('/admin/plans?msg=plan_updated');
  }

  static postTogglePlan(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const planId = parseInt(String(req.params.id), 10);

    PlanModel.toggleEnabled(planId);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_TOGGLE', `Toggled status of plan #${planId}`, req.ip || '127.0.0.1');

    res.redirect('/admin/plans?msg=plan_toggled');
  }

  static postDuplicatePlan(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const planId = parseInt(String(req.params.id), 10);

    const newPlan = PlanModel.duplicate(planId);
    if (newPlan) {
      ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_DUPLICATE', `Duplicated plan #${planId} to "${newPlan.name}"`, req.ip || '127.0.0.1');
    }

    res.redirect('/admin/plans?msg=plan_duplicated');
  }

  static postDeletePlan(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const planId = parseInt(String(req.params.id), 10);

    PlanModel.delete(planId);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_DELETE', `Deleted plan #${planId}`, req.ip || '127.0.0.1');

    res.redirect('/admin/plans?msg=plan_deleted');
  }

  // ── Panel Settings ──────────────────────────────────────────────────
  static getSettings(req: Request, res: Response): void {
    const user = UserModel.findById(req.session.userId!);
    if (!user) return res.redirect('/login');

    const settings = SettingModel.getAll();

    res.render('admin/settings', {
      title: 'Panel Branding & Settings',
      user,
      settings,
      msg: req.query.msg || null,
      err: req.query.err || null
    });
  }

  static postUpdateSettings(req: Request, res: Response): void {
    const adminUser = UserModel.findById(req.session.userId!)!;
    const body = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    const updatedKV: Record<string, string> = {};

    // Standard text settings
    const keys = [
      'panel_name', 'company_name', 'site_title', 'site_description',
      'site_logo', 'site_favicon', 'hero_bg_video', 'hero_art',
      'review_bg', 'login_bg', 'profile_banner', 'overview_banner',
      'primary_color', 'accent_color', 'footer_text',
      'discord_link', 'twitter_link', 'github_link',
      'allow_registration', 'default_avatar_strategy'
    ];

    for (const key of keys) {
      if (body[key] !== undefined) {
        updatedKV[key] = String(body[key]).trim();
      }
    }

    // Handle file uploads if present
    if (files) {
      for (const [fieldname, fileArr] of Object.entries(files)) {
        if (fileArr && fileArr.length > 0) {
          updatedKV[fieldname] = `/images/${fileArr[0].filename}`;
        }
      }
    }

    SettingModel.setMany(updatedKV);

    ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SETTINGS_UPDATE', `Updated panel branding and settings`, req.ip || '127.0.0.1');

    res.redirect('/admin/settings?msg=settings_updated');
  }

  // ── Audit Logs ─────────────────────────────────────────────────────
  static getAuditLogs(req: Request, res: Response): void {
    const user = UserModel.findById(req.session.userId!);
    if (!user) return res.redirect('/login');

    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = 15;
    const search = String(req.query.search || '').trim();
    const actionFilter = String(req.query.action || '').trim();

    const logs = ActivityModel.findAll({ search, action: actionFilter, page, limit });
    const totalCount = ActivityModel.countFiltered({ search, action: actionFilter });
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const distinctActions = ActivityModel.getDistinctActions();
    const settings = SettingModel.getAll();

    res.render('admin/logs', {
      title: 'Audit Logs',
      user,
      logs,
      totalCount,
      page,
      totalPages,
      search,
      actionFilter,
      distinctActions,
      settings
    });
  }
}

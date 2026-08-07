"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userModel_1 = require("../models/userModel");
const serverModel_1 = require("../models/serverModel");
const nodeService_1 = require("../services/nodeService");
const planModel_1 = require("../models/planModel");
const settingModel_1 = require("../models/settingModel");
const activityModel_1 = require("../models/activityModel");
class AdminController {
    // ── Overview ────────────────────────────────────────────────────────
    static getOverview(req, res) {
        const user = userModel_1.UserModel.findById(req.session.userId);
        const totalUsers = userModel_1.UserModel.countAll();
        const activeUsers = userModel_1.UserModel.countActive();
        const suspendedUsers = userModel_1.UserModel.countSuspended();
        const totalServers = serverModel_1.ServerModel.countAll();
        const onlineServers = serverModel_1.ServerModel.countOnline();
        const offlineServers = serverModel_1.ServerModel.countOffline();
        const node = nodeService_1.NodeService.getSystemMetrics();
        const recentLogs = activityModel_1.ActivityModel.findAll({ limit: 6 });
        const settings = settingModel_1.SettingModel.getAll();
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
    static getNodes(req, res) {
        const user = userModel_1.UserModel.findById(req.session.userId);
        const node = nodeService_1.NodeService.getSystemMetrics();
        const settings = settingModel_1.SettingModel.getAll();
        res.render('admin/nodes', {
            title: 'Local Node Management',
            user,
            node,
            settings
        });
    }
    // ── Users Management ───────────────────────────────────────────────
    static getUsers(req, res) {
        const user = userModel_1.UserModel.findById(req.session.userId);
        const page = parseInt(String(req.query.page || '1'), 10);
        const limit = 10;
        const search = String(req.query.search || '').trim();
        const roleFilter = String(req.query.role || '').trim();
        const statusFilter = String(req.query.status || '').trim();
        const users = userModel_1.UserModel.findAll({ search, role: roleFilter, status: statusFilter, page, limit });
        const totalCount = userModel_1.UserModel.countFiltered({ search, role: roleFilter, status: statusFilter });
        const totalPages = Math.ceil(totalCount / limit) || 1;
        const settings = settingModel_1.SettingModel.getAll();
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
            msg: req.query.msg,
            err: req.query.err
        });
    }
    static postCreateUser(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const { username, email, password, role } = req.body;
        if (!username || !email || !password) {
            return res.redirect('/admin/users?err=missing_fields');
        }
        const cleanUsername = String(username).trim();
        const cleanEmail = String(email).trim().toLowerCase();
        if (userModel_1.UserModel.findByUsername(cleanUsername)) {
            return res.redirect('/admin/users?err=username_exists');
        }
        if (userModel_1.UserModel.findByEmail(cleanEmail)) {
            return res.redirect('/admin/users?err=email_exists');
        }
        const password_hash = bcryptjs_1.default.hashSync(password, 10);
        const avatar = '/images/banners/big-steve-face.png';
        const newUser = userModel_1.UserModel.create({
            username: cleanUsername,
            email: cleanEmail,
            password_hash,
            avatar,
            role: role === 'superadmin' || role === 'admin' ? role : 'user'
        });
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_CREATE', `Created user "${newUser.username}" (${newUser.role})`, req.ip || '127.0.0.1');
        res.redirect('/admin/users?msg=user_created');
    }
    static postEditUser(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const userId = parseInt(String(req.params.id), 10);
        const { username, email } = req.body;
        const targetUser = userModel_1.UserModel.findById(userId);
        if (!targetUser) {
            return res.redirect('/admin/users?err=user_not_found');
        }
        if (username)
            userModel_1.UserModel.updateUsername(userId, String(username).trim());
        if (email)
            userModel_1.UserModel.updateEmail(userId, String(email).trim().toLowerCase());
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_EDIT', `Updated details for user "${targetUser.username}"`, req.ip || '127.0.0.1');
        res.redirect('/admin/users?msg=user_updated');
    }
    static postToggleSuspend(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const userId = parseInt(String(req.params.id), 10);
        if (userId === adminUser.id) {
            return res.redirect('/admin/users?err=cannot_suspend_self');
        }
        const targetUser = userModel_1.UserModel.findById(userId);
        if (!targetUser) {
            return res.redirect('/admin/users?err=user_not_found');
        }
        const newStatus = targetUser.status === 'active' ? 'suspended' : 'active';
        userModel_1.UserModel.updateStatus(userId, newStatus);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_STATUS', `${newStatus === 'suspended' ? 'Suspended' : 'Unsuspended'} user "${targetUser.username}"`, req.ip || '127.0.0.1');
        res.redirect(`/admin/users?msg=user_${newStatus}`);
    }
    static postResetPassword(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const userId = parseInt(String(req.params.id), 10);
        const { new_password } = req.body;
        if (!new_password || new_password.length < 6) {
            return res.redirect('/admin/users?err=invalid_password');
        }
        const targetUser = userModel_1.UserModel.findById(userId);
        if (!targetUser) {
            return res.redirect('/admin/users?err=user_not_found');
        }
        const password_hash = bcryptjs_1.default.hashSync(new_password, 10);
        userModel_1.UserModel.updatePassword(userId, password_hash);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_PASS_RESET', `Reset password for user "${targetUser.username}"`, req.ip || '127.0.0.1');
        res.redirect('/admin/users?msg=password_reset');
    }
    static postChangeRole(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const userId = parseInt(String(req.params.id), 10);
        const { role } = req.body;
        if (userId === adminUser.id && role !== adminUser.role) {
            return res.redirect('/admin/users?err=cannot_change_own_role');
        }
        const targetUser = userModel_1.UserModel.findById(userId);
        if (!targetUser) {
            return res.redirect('/admin/users?err=user_not_found');
        }
        if (targetUser.role === 'superadmin' && role !== 'superadmin' && userModel_1.UserModel.countSuperAdmins() <= 1) {
            return res.redirect('/admin/users?err=cannot_demote_last_superadmin');
        }
        userModel_1.UserModel.updateRole(userId, role);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_ROLE_CHANGE', `Changed role of "${targetUser.username}" to ${role}`, req.ip || '127.0.0.1');
        res.redirect('/admin/users?msg=role_updated');
    }
    static postDeleteUser(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const userId = parseInt(String(req.params.id), 10);
        if (userId === adminUser.id) {
            return res.redirect('/admin/users?err=cannot_delete_self');
        }
        const targetUser = userModel_1.UserModel.findById(userId);
        if (!targetUser) {
            return res.redirect('/admin/users?err=user_not_found');
        }
        if (targetUser.role === 'superadmin' && userModel_1.UserModel.countSuperAdmins() <= 1) {
            return res.redirect('/admin/users?err=cannot_delete_last_superadmin');
        }
        userModel_1.UserModel.softDelete(userId);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_USER_DELETE', `Deleted user "${targetUser.username}"`, req.ip || '127.0.0.1');
        res.redirect('/admin/users?msg=user_deleted');
    }
    // ── Plans Management ───────────────────────────────────────────────
    static getPlans(req, res) {
        const user = userModel_1.UserModel.findById(req.session.userId);
        const plans = planModel_1.PlanModel.findAll();
        const settings = settingModel_1.SettingModel.getAll();
        res.render('admin/plans', {
            title: 'Plan Management',
            user,
            plans,
            settings,
            msg: req.query.msg,
            err: req.query.err
        });
    }
    static postCreatePlan(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const { name, description, memory_limit, cpu_limit, disk_limit, max_servers, max_backups, max_databases, max_allocations, price } = req.body;
        if (!name) {
            return res.redirect('/admin/plans?err=missing_name');
        }
        const plan = planModel_1.PlanModel.create({
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
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_CREATE', `Created plan "${plan.name}"`, req.ip || '127.0.0.1');
        res.redirect('/admin/plans?msg=plan_created');
    }
    static postEditPlan(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const planId = parseInt(String(req.params.id), 10);
        const { name, description, memory_limit, cpu_limit, disk_limit, max_servers, max_backups, max_databases, max_allocations, price, is_enabled } = req.body;
        planModel_1.PlanModel.update(planId, {
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
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_EDIT', `Updated plan #${planId} "${name}"`, req.ip || '127.0.0.1');
        res.redirect('/admin/plans?msg=plan_updated');
    }
    static postTogglePlan(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const planId = parseInt(String(req.params.id), 10);
        planModel_1.PlanModel.toggleEnabled(planId);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_TOGGLE', `Toggled status of plan #${planId}`, req.ip || '127.0.0.1');
        res.redirect('/admin/plans?msg=plan_toggled');
    }
    static postDuplicatePlan(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const planId = parseInt(String(req.params.id), 10);
        const newPlan = planModel_1.PlanModel.duplicate(planId);
        if (newPlan) {
            activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_DUPLICATE', `Duplicated plan #${planId} to "${newPlan.name}"`, req.ip || '127.0.0.1');
        }
        res.redirect('/admin/plans?msg=plan_duplicated');
    }
    static postDeletePlan(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const planId = parseInt(String(req.params.id), 10);
        planModel_1.PlanModel.delete(planId);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_PLAN_DELETE', `Deleted plan #${planId}`, req.ip || '127.0.0.1');
        res.redirect('/admin/plans?msg=plan_deleted');
    }
    // ── Panel Settings ──────────────────────────────────────────────────
    static getSettings(req, res) {
        const user = userModel_1.UserModel.findById(req.session.userId);
        const settings = settingModel_1.SettingModel.getAll();
        res.render('admin/settings', {
            title: 'Panel Branding & Settings',
            user,
            settings,
            msg: req.query.msg,
            err: req.query.err
        });
    }
    static postUpdateSettings(req, res) {
        const adminUser = userModel_1.UserModel.findById(req.session.userId);
        const body = req.body;
        const files = req.files;
        const updatedKV = {};
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
        settingModel_1.SettingModel.setMany(updatedKV);
        activityModel_1.ActivityModel.log(adminUser.id, adminUser.username, 'ADMIN_SETTINGS_UPDATE', `Updated panel branding and settings`, req.ip || '127.0.0.1');
        res.redirect('/admin/settings?msg=settings_updated');
    }
    // ── Audit Logs ─────────────────────────────────────────────────────
    static getAuditLogs(req, res) {
        const user = userModel_1.UserModel.findById(req.session.userId);
        const page = parseInt(String(req.query.page || '1'), 10);
        const limit = 15;
        const search = String(req.query.search || '').trim();
        const actionFilter = String(req.query.action || '').trim();
        const logs = activityModel_1.ActivityModel.findAll({ search, action: actionFilter, page, limit });
        const totalCount = activityModel_1.ActivityModel.countFiltered({ search, action: actionFilter });
        const totalPages = Math.ceil(totalCount / limit) || 1;
        const distinctActions = activityModel_1.ActivityModel.getDistinctActions();
        const settings = settingModel_1.SettingModel.getAll();
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
exports.AdminController = AdminController;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginController = void 0;
const serverModel_1 = require("../models/serverModel");
const userModel_1 = require("../models/userModel");
const pluginCompatibilityService_1 = require("../services/pluginCompatibilityService");
const pluginManagerService_1 = require("../services/pluginManagerService");
const modrinthService_1 = require("../services/modrinthService");
class PluginController {
    static authorize(req, res) {
        const isJson = req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (!req.session || !req.session.userId) {
            if (isJson) {
                res.status(401).json({ success: false, error: 'UNAUTHENTICATED', message: 'User session expired. Please log in.' });
                return null;
            }
            res.redirect('/login');
            return null;
        }
        const user = userModel_1.UserModel.findById(req.session.userId);
        if (!user || user.status === 'suspended') {
            if (isJson) {
                res.status(403).json({ success: false, error: 'ACCOUNT_SUSPENDED', message: 'Account is suspended.' });
                return null;
            }
            res.redirect('/login');
            return null;
        }
        const uuid = String(req.params.uuid);
        const server = serverModel_1.ServerModel.findByUuid(uuid);
        if (!server) {
            if (isJson) {
                res.status(404).json({ success: false, error: 'SERVER_NOT_FOUND', message: 'Server instance not found.' });
                return null;
            }
            res.redirect('/dashboard');
            return null;
        }
        // Server access permission check
        const isOwner = server.user_id === user.id;
        const isAdmin = user.role === 'admin' || user.role === 'superadmin';
        if (!isOwner && !isAdmin) {
            if (isJson) {
                res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied: You do not own this server.' });
                return null;
            }
            res.redirect('/dashboard');
            return null;
        }
        return { user, server };
    }
    /**
     * Renders the main Plugins management page views/server/plugins.ejs
     */
    static getPluginsPage(req, res) {
        const auth = PluginController.authorize(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const isSupported = pluginCompatibilityService_1.PluginCompatibilityService.isSupportedServerSoftware(server);
        const installedPlugins = isSupported ? pluginManagerService_1.PluginManagerService.getInstalledPlugins(server) : [];
        res.render('server/plugins', {
            title: `${server.name} — Plugins`,
            user,
            server,
            path: req.path,
            isSupported,
            installedPlugins
        });
    }
    /**
     * API: Search Modrinth plugins (GET /dashboard/server/:uuid/plugins/api/search)
     */
    static async apiSearchPlugins(req, res) {
        const auth = PluginController.authorize(req, res);
        if (!auth)
            return;
        const { server } = auth;
        if (!pluginCompatibilityService_1.PluginCompatibilityService.isSupportedServerSoftware(server)) {
            res.status(400).json({
                success: false,
                error: 'INCOMPATIBLE_SERVER',
                message: 'Plugin installation is unavailable because this server\'s software is not Bukkit-compatible.'
            });
            return;
        }
        try {
            const query = String(req.query.q || req.query.query || '');
            const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
            const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '12'), 10) || 12));
            const index = String(req.query.index || 'downloads');
            const result = await modrinthService_1.ModrinthService.searchPlugins(query, { offset, limit, index });
            // Multi-stage filtering: strictly Bukkit/Paper plugins
            const filteredHits = result.hits.filter(hit => pluginCompatibilityService_1.PluginCompatibilityService.isPluginProject(hit));
            res.json({
                success: true,
                hits: filteredHits,
                total_hits: result.total_hits
            });
        }
        catch (e) {
            res.status(e.statusCode || 500).json({
                success: false,
                error: e.code || 'SEARCH_ERROR',
                message: e.message || 'Failed to search Modrinth plugins.'
            });
        }
    }
    /**
     * API: Get project details & compatible versions (GET /dashboard/server/:uuid/plugins/api/project/:slug)
     */
    static async apiGetProjectDetails(req, res) {
        const auth = PluginController.authorize(req, res);
        if (!auth)
            return;
        const { server } = auth;
        if (!pluginCompatibilityService_1.PluginCompatibilityService.isSupportedServerSoftware(server)) {
            res.status(400).json({
                success: false,
                error: 'INCOMPATIBLE_SERVER',
                message: 'Plugin installation is unavailable for non-Bukkit server software.'
            });
            return;
        }
        try {
            const slug = String(req.params.slug);
            const project = await modrinthService_1.ModrinthService.getProject(slug);
            if (!project || !pluginCompatibilityService_1.PluginCompatibilityService.isPluginProject(project)) {
                res.status(404).json({
                    success: false,
                    error: 'PROJECT_NOT_FOUND',
                    message: 'Modrinth plugin project not found or not Bukkit-compatible.'
                });
                return;
            }
            const versions = await modrinthService_1.ModrinthService.getVersions(project.id, server.version);
            const compatibleVersions = pluginCompatibilityService_1.PluginCompatibilityService.filterCompatibleVersions(versions, server);
            res.json({
                success: true,
                project,
                compatibleVersions
            });
        }
        catch (e) {
            res.status(e.statusCode || 500).json({
                success: false,
                error: e.code || 'PROJECT_ERROR',
                message: e.message || 'Failed to fetch project details.'
            });
        }
    }
    /**
     * API: Fetch list of installed .jar files on disk (GET /dashboard/server/:uuid/plugins/api/installed)
     */
    static apiGetInstalled(req, res) {
        const auth = PluginController.authorize(req, res);
        if (!auth)
            return;
        const { server } = auth;
        if (!pluginCompatibilityService_1.PluginCompatibilityService.isSupportedServerSoftware(server)) {
            res.status(400).json({ success: false, error: 'INCOMPATIBLE_SERVER', installedPlugins: [] });
            return;
        }
        const installedPlugins = pluginManagerService_1.PluginManagerService.getInstalledPlugins(server);
        res.json({ success: true, installedPlugins });
    }
    /**
     * API: Download & Install Plugin (POST /dashboard/server/:uuid/plugins/api/install)
     */
    static async apiInstallPlugin(req, res) {
        const auth = PluginController.authorize(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const projectIdOrSlug = String(req.body.projectId || req.body.slug || '');
        if (!projectIdOrSlug) {
            res.status(400).json({ success: false, error: 'MISSING_PROJECT_ID', message: 'Plugin project ID or slug is required.' });
            return;
        }
        try {
            const result = await pluginManagerService_1.PluginManagerService.installPlugin(server, projectIdOrSlug, user, req.ip);
            res.json(result);
        }
        catch (e) {
            res.status(e.statusCode || 500).json({
                success: false,
                error: e.code || 'INSTALL_FAILED',
                message: e.message || 'Plugin installation failed.'
            });
        }
    }
    /**
     * API: Delete installed plugin .jar (POST /dashboard/server/:uuid/plugins/api/delete)
     */
    static apiDeletePlugin(req, res) {
        const auth = PluginController.authorize(req, res);
        if (!auth)
            return;
        const { user, server } = auth;
        const filename = String(req.body.filename || '');
        if (!filename) {
            res.status(400).json({ success: false, error: 'MISSING_FILENAME', message: 'Plugin file name is required.' });
            return;
        }
        try {
            const result = pluginManagerService_1.PluginManagerService.deletePlugin(server, filename, user, req.ip);
            res.json(result);
        }
        catch (e) {
            res.status(e.statusCode || 500).json({
                success: false,
                error: e.code || 'DELETE_FAILED',
                message: e.message || 'Failed to delete plugin file.'
            });
        }
    }
}
exports.PluginController = PluginController;

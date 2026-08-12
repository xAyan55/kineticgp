"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const serverDashboardController_1 = require("../controllers/serverDashboardController");
const mcjarsVersionService_1 = require("../services/mcjarsVersionService");
const router = (0, express_1.Router)();
// Protect all server routes with auth
router.use(authMiddleware_1.requireAuth);
// JSON API: fetch available versions for a given software type (user-facing)
router.get('/api/versions/:software', async (req, res) => {
    try {
        const software = req.params.software;
        const versions = await mcjarsVersionService_1.McJarsVersionService.getVersions(software);
        res.json({ success: true, versions });
    }
    catch (e) {
        res.json({ success: false, versions: [] });
    }
});
router.get('/:uuid', serverDashboardController_1.ServerDashboardController.getIndex);
// Console & SSE
router.get('/:uuid/console', serverDashboardController_1.ServerDashboardController.getConsole);
router.get('/:uuid/sse', serverDashboardController_1.ServerDashboardController.streamConsoleSSE);
router.get('/:uuid/recent-logs', serverDashboardController_1.ServerDashboardController.getRecentLogs);
router.post('/:uuid/power', serverDashboardController_1.ServerDashboardController.postPowerAction);
router.post('/:uuid/command', serverDashboardController_1.ServerDashboardController.postSendCommand);
// Web File Manager
router.get('/:uuid/files', serverDashboardController_1.ServerDashboardController.getFiles);
router.get('/:uuid/files/edit', serverDashboardController_1.ServerDashboardController.getEditFile);
router.get('/:uuid/files/content', serverDashboardController_1.ServerDashboardController.getFileContent);
router.post('/:uuid/files/save', serverDashboardController_1.ServerDashboardController.postSaveFile);
router.post('/:uuid/files/create', serverDashboardController_1.ServerDashboardController.postCreateItem);
router.post('/:uuid/files/rename', serverDashboardController_1.ServerDashboardController.postRenameItem);
router.post('/:uuid/files/delete', serverDashboardController_1.ServerDashboardController.postDeleteItem);
router.post('/:uuid/files/upload', serverDashboardController_1.fileUpload.single('file'), serverDashboardController_1.ServerDashboardController.postUploadFile);
router.get('/:uuid/files/download', serverDashboardController_1.ServerDashboardController.getDownloadFile);
// Settings
router.get('/:uuid/settings', serverDashboardController_1.ServerDashboardController.getSettings);
router.post('/:uuid/settings/save', serverDashboardController_1.ServerDashboardController.postSaveSettings);
// Real Modrinth Plugin Installer
const pluginController_1 = require("../controllers/pluginController");
router.get('/:uuid/plugins', pluginController_1.PluginController.getPluginsPage);
router.get('/:uuid/plugins/api/search', pluginController_1.PluginController.apiSearchPlugins);
router.get('/:uuid/plugins/api/project/:slug', pluginController_1.PluginController.apiGetProjectDetails);
router.get('/:uuid/plugins/api/installed', pluginController_1.PluginController.apiGetInstalled);
router.get('/:uuid/plugins/api/progress', pluginController_1.PluginController.apiGetProgress);
router.post('/:uuid/plugins/api/install', pluginController_1.PluginController.apiInstallPlugin);
router.post('/:uuid/plugins/api/delete', pluginController_1.PluginController.apiDeletePlugin);
exports.default = router;

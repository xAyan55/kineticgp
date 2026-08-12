import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { ServerDashboardController, fileUpload } from '../controllers/serverDashboardController';
import { McJarsVersionService } from '../services/mcjarsVersionService';

const router = Router();

// Protect all server routes with auth
router.use(requireAuth);

// JSON API: fetch available versions for a given software type (user-facing)
router.get('/api/versions/:software', async (req, res) => {
  try {
    const software = req.params.software;
    const versions = await McJarsVersionService.getVersions(software);
    res.json({ success: true, versions });
  } catch (e) {
    res.json({ success: false, versions: [] });
  }
});
router.get('/:uuid', ServerDashboardController.getIndex);

// Console & SSE
router.get('/:uuid/console', ServerDashboardController.getConsole);
router.get('/:uuid/sse', ServerDashboardController.streamConsoleSSE);
router.get('/:uuid/recent-logs', ServerDashboardController.getRecentLogs);
router.post('/:uuid/power', ServerDashboardController.postPowerAction);
router.post('/:uuid/command', ServerDashboardController.postSendCommand);

// Web File Manager
router.get('/:uuid/files', ServerDashboardController.getFiles);
router.get('/:uuid/files/edit', ServerDashboardController.getEditFile);
router.get('/:uuid/files/content', ServerDashboardController.getFileContent);
router.post('/:uuid/files/save', ServerDashboardController.postSaveFile);
router.post('/:uuid/files/create', ServerDashboardController.postCreateItem);
router.post('/:uuid/files/rename', ServerDashboardController.postRenameItem);
router.post('/:uuid/files/delete', ServerDashboardController.postDeleteItem);
router.post('/:uuid/files/upload', fileUpload.single('file'), ServerDashboardController.postUploadFile);
router.get('/:uuid/files/download', ServerDashboardController.getDownloadFile);

// Settings
router.get('/:uuid/settings', ServerDashboardController.getSettings);
router.post('/:uuid/settings/save', ServerDashboardController.postSaveSettings);

// Real Modrinth Plugin Installer
import { PluginController } from '../controllers/pluginController';
router.get('/:uuid/plugins', PluginController.getPluginsPage);
router.get('/:uuid/plugins/api/search', PluginController.apiSearchPlugins);
router.get('/:uuid/plugins/api/project/:slug', PluginController.apiGetProjectDetails);
router.get('/:uuid/plugins/api/installed', PluginController.apiGetInstalled);
router.get('/:uuid/plugins/api/progress', PluginController.apiGetProgress);
router.post('/:uuid/plugins/api/install', PluginController.apiInstallPlugin);
router.post('/:uuid/plugins/api/delete', PluginController.apiDeletePlugin);

export default router;

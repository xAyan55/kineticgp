import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { ServerDashboardController, fileUpload } from '../controllers/serverDashboardController';

const router = Router();

// Protect all server routes with auth
router.use(requireAuth);

router.get('/:uuid', ServerDashboardController.getIndex);

// Console & SSE
router.get('/:uuid/console', ServerDashboardController.getConsole);
router.get('/:uuid/sse', ServerDashboardController.streamConsoleSSE);
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

export default router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const serverDashboardController_1 = require("../controllers/serverDashboardController");
const router = (0, express_1.Router)();
// Protect all server routes with auth
router.use(authMiddleware_1.requireAuth);
router.get('/:uuid', serverDashboardController_1.ServerDashboardController.getIndex);
// Console & SSE
router.get('/:uuid/console', serverDashboardController_1.ServerDashboardController.getConsole);
router.get('/:uuid/sse', serverDashboardController_1.ServerDashboardController.streamConsoleSSE);
router.post('/:uuid/power', serverDashboardController_1.ServerDashboardController.postPowerAction);
router.post('/:uuid/command', serverDashboardController_1.ServerDashboardController.postSendCommand);
// Web File Manager
router.get('/:uuid/files', serverDashboardController_1.ServerDashboardController.getFiles);
router.get('/:uuid/files/edit', serverDashboardController_1.ServerDashboardController.getEditFile);
router.post('/:uuid/files/save', serverDashboardController_1.ServerDashboardController.postSaveFile);
router.post('/:uuid/files/create', serverDashboardController_1.ServerDashboardController.postCreateItem);
router.post('/:uuid/files/rename', serverDashboardController_1.ServerDashboardController.postRenameItem);
router.post('/:uuid/files/delete', serverDashboardController_1.ServerDashboardController.postDeleteItem);
router.post('/:uuid/files/upload', serverDashboardController_1.fileUpload.single('file'), serverDashboardController_1.ServerDashboardController.postUploadFile);
router.get('/:uuid/files/download', serverDashboardController_1.ServerDashboardController.getDownloadFile);
// Settings
router.get('/:uuid/settings', serverDashboardController_1.ServerDashboardController.getSettings);
router.post('/:uuid/settings/save', serverDashboardController_1.ServerDashboardController.postSaveSettings);
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminMiddleware_1 = require("../middleware/adminMiddleware");
const adminServerController_1 = require("../controllers/adminServerController");
const mcjarsVersionService_1 = require("../services/mcjarsVersionService");
const router = (0, express_1.Router)();
router.use(adminMiddleware_1.requireAdmin);
// JSON API: fetch available versions for a given software type
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
// JSON API: list all supported software types
router.get('/api/software', (_req, res) => {
    res.json({ success: true, types: mcjarsVersionService_1.McJarsVersionService.SOFTWARE_TYPES });
});
router.get('/', adminServerController_1.AdminServerController.getServers);
router.get('/create', adminServerController_1.AdminServerController.getCreateServer);
router.post('/create', adminServerController_1.AdminServerController.postCreateServer);
router.post('/:id/suspend', adminServerController_1.AdminServerController.postToggleSuspendServer);
router.post('/:id/owner', adminServerController_1.AdminServerController.postChangeOwner);
router.post('/:id/delete', adminServerController_1.AdminServerController.postDeleteServer);
router.post('/:id/retry', adminServerController_1.AdminServerController.postRetryInstallation);
exports.default = router;

import { Router } from 'express';
import { requireAdmin } from '../middleware/adminMiddleware';
import { AdminServerController } from '../controllers/adminServerController';
import { McJarsVersionService } from '../services/mcjarsVersionService';

const router = Router();
router.use(requireAdmin);

// JSON API: fetch available versions for a given software type
router.get('/api/versions/:software', async (req, res) => {
  try {
    const software = req.params.software;
    const versions = await McJarsVersionService.getVersions(software);
    res.json({ success: true, versions });
  } catch (e) {
    res.json({ success: false, versions: [] });
  }
});

// JSON API: list all supported software types
router.get('/api/software', (_req, res) => {
  res.json({ success: true, types: McJarsVersionService.SOFTWARE_TYPES });
});

router.get('/', AdminServerController.getServers);
router.get('/create', AdminServerController.getCreateServer);
router.post('/create', AdminServerController.postCreateServer);
router.post('/:id/suspend', AdminServerController.postToggleSuspendServer);
router.post('/:id/owner', AdminServerController.postChangeOwner);
router.post('/:id/delete', AdminServerController.postDeleteServer);
router.post('/:id/retry', AdminServerController.postRetryInstallation);

export default router;


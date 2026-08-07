import { Router } from 'express';
import { requireAdmin } from '../middleware/adminMiddleware';
import { AdminServerController } from '../controllers/adminServerController';

const router = Router();
router.use(requireAdmin);

router.get('/', AdminServerController.getServers);
router.get('/create', AdminServerController.getCreateServer);
router.post('/create', AdminServerController.postCreateServer);
router.post('/:id/suspend', AdminServerController.postToggleSuspendServer);
router.post('/:id/owner', AdminServerController.postChangeOwner);
router.post('/:id/delete', AdminServerController.postDeleteServer);
router.post('/:id/retry', AdminServerController.postRetryInstallation);

export default router;

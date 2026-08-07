import { Router } from 'express';
import { ProfileController } from '../controllers/profileController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.get('/', requireAuth, ProfileController.getProfile);
router.post('/update-username', requireAuth, ProfileController.updateUsername);
router.post('/update-password', requireAuth, ProfileController.updatePassword);
router.post('/update-avatar', requireAuth, ProfileController.updateAvatar);

export default router;

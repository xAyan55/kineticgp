import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { redirectIfAuth } from '../middleware/authMiddleware';
import { authLimiter } from '../middleware/rateLimitMiddleware';

const router = Router();

router.get('/login', redirectIfAuth, AuthController.getLogin);
router.post('/login', redirectIfAuth, authLimiter, AuthController.postLogin);

router.get('/register', redirectIfAuth, AuthController.getRegister);
router.post('/register', redirectIfAuth, authLimiter, AuthController.postRegister);

router.all('/logout', AuthController.logout);

export default router;

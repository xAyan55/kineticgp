import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { requireAuth } from '../middleware/authMiddleware';
import { apiLimiter } from '../middleware/rateLimitMiddleware';

const router = Router();

router.get('/', requireAuth, DashboardController.getDashboard);
router.post('/servers/:id/action', requireAuth, apiLimiter, DashboardController.handleServerAction);

export default router;

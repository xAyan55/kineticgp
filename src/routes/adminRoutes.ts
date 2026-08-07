import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAdmin, requireSuperAdmin } from '../middleware/adminMiddleware';
import { AdminController } from '../controllers/adminController';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), 'public', 'images'));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

const router = Router();

// Protect all admin routes with requireAdmin middleware
router.use(requireAdmin);

// Overview
router.get('/', AdminController.getOverview);

// Nodes Management
router.get('/nodes', AdminController.getNodes);

// User Management
router.get('/users', AdminController.getUsers);
router.post('/users/create', AdminController.postCreateUser);
router.post('/users/:id/edit', AdminController.postEditUser);
router.post('/users/:id/suspend', AdminController.postToggleSuspend);
router.post('/users/:id/reset-password', AdminController.postResetPassword);
router.post('/users/:id/role', requireSuperAdmin, AdminController.postChangeRole);
router.post('/users/:id/delete', AdminController.postDeleteUser);

// Plan Management
router.get('/plans', AdminController.getPlans);
router.post('/plans/create', AdminController.postCreatePlan);
router.post('/plans/:id/edit', AdminController.postEditPlan);
router.post('/plans/:id/toggle', AdminController.postTogglePlan);
router.post('/plans/:id/duplicate', AdminController.postDuplicatePlan);
router.post('/plans/:id/delete', AdminController.postDeletePlan);

// Settings (Panel Branding)
router.get('/settings', AdminController.getSettings);
router.post('/settings/update', upload.fields([
  { name: 'site_logo', maxCount: 1 },
  { name: 'site_favicon', maxCount: 1 },
  { name: 'hero_bg_video', maxCount: 1 },
  { name: 'hero_art', maxCount: 1 },
  { name: 'review_bg', maxCount: 1 },
  { name: 'login_bg', maxCount: 1 },
  { name: 'profile_banner', maxCount: 1 },
  { name: 'overview_banner', maxCount: 1 }
]), AdminController.postUpdateSettings);

// Audit Logs
router.get('/logs', AdminController.getAuditLogs);

export default router;

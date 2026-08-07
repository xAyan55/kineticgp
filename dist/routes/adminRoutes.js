"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const adminMiddleware_1 = require("../middleware/adminMiddleware");
const adminController_1 = require("../controllers/adminController");
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path_1.default.join(process.cwd(), 'public', 'images'));
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = (0, multer_1.default)({ storage });
const router = (0, express_1.Router)();
// Protect all admin routes with requireAdmin middleware
router.use(adminMiddleware_1.requireAdmin);
// Overview
router.get('/', adminController_1.AdminController.getOverview);
// Nodes Management
router.get('/nodes', adminController_1.AdminController.getNodes);
// User Management
router.get('/users', adminController_1.AdminController.getUsers);
router.post('/users/create', adminController_1.AdminController.postCreateUser);
router.post('/users/:id/edit', adminController_1.AdminController.postEditUser);
router.post('/users/:id/suspend', adminController_1.AdminController.postToggleSuspend);
router.post('/users/:id/reset-password', adminController_1.AdminController.postResetPassword);
router.post('/users/:id/role', adminMiddleware_1.requireSuperAdmin, adminController_1.AdminController.postChangeRole);
router.post('/users/:id/delete', adminController_1.AdminController.postDeleteUser);
// Plan Management
router.get('/plans', adminController_1.AdminController.getPlans);
router.post('/plans/create', adminController_1.AdminController.postCreatePlan);
router.post('/plans/:id/edit', adminController_1.AdminController.postEditPlan);
router.post('/plans/:id/toggle', adminController_1.AdminController.postTogglePlan);
router.post('/plans/:id/duplicate', adminController_1.AdminController.postDuplicatePlan);
router.post('/plans/:id/delete', adminController_1.AdminController.postDeletePlan);
// Settings (Panel Branding)
router.get('/settings', adminController_1.AdminController.getSettings);
router.post('/settings/update', upload.fields([
    { name: 'site_logo', maxCount: 1 },
    { name: 'site_favicon', maxCount: 1 },
    { name: 'hero_bg_video', maxCount: 1 },
    { name: 'hero_art', maxCount: 1 },
    { name: 'review_bg', maxCount: 1 },
    { name: 'login_bg', maxCount: 1 },
    { name: 'profile_banner', maxCount: 1 },
    { name: 'overview_banner', maxCount: 1 }
]), adminController_1.AdminController.postUpdateSettings);
// Audit Logs
router.get('/logs', adminController_1.AdminController.getAuditLogs);
exports.default = router;

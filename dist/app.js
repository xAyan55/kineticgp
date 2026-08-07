"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const database_1 = require("./db/database");
const csrfMiddleware_1 = require("./middleware/csrfMiddleware");
const userModel_1 = require("./models/userModel");
const landingRoutes_1 = __importDefault(require("./routes/landingRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const serverDashboardRoutes_1 = __importDefault(require("./routes/serverDashboardRoutes"));
const app = (0, express_1.default)();
// Trust Proxy for Cloudflare Tunnel & Reverse Proxies
app.set('trust proxy', 1);
// Database Initialization
(0, database_1.initDatabase)();
// View Engine
app.set('views', path_1.default.join(process.cwd(), 'views'));
app.set('view engine', 'ejs');
// Security & Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Allowed for video sources, cdn scripts, inline svg
    crossOriginEmbedderPolicy: false
}));
app.use((0, compression_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// Static Folder
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
// Express Session
app.use((0, express_session_1.default)({
    secret: config_1.CONFIG.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config_1.CONFIG.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));
// CSRF & View Globals Middleware
app.use(csrfMiddleware_1.csrfProtection);
app.use((req, res, next) => {
    if (req.session?.userId) {
        const user = userModel_1.UserModel.findById(req.session.userId);
        res.locals.currentUser = user;
    }
    else {
        res.locals.currentUser = null;
    }
    res.locals.path = req.path;
    next();
});
// Routes
app.use('/', landingRoutes_1.default);
app.use('/', authRoutes_1.default);
app.use('/dashboard', dashboardRoutes_1.default);
app.use('/dashboard/profile', profileRoutes_1.default);
app.use('/dashboard/server', serverDashboardRoutes_1.default);
app.use('/admin', adminRoutes_1.default);
// 404 Handler
app.use((req, res) => {
    res.status(404).render('landing', {
        title: '404 Page Not Found',
        siteTitle: 'KineticGP Panel',
        siteDescription: 'The requested page could not be found.',
        user: res.locals.currentUser
    });
});
// 500 Global Error Handler
app.use((err, req, res, _next) => {
    console.error('Unhandled System Error:', err);
    res.status(500).send('Internal Server Error. Please try again later.');
});
// Start Server
if (process.env.NODE_ENV !== 'test') {
    app.listen(config_1.CONFIG.PORT, '0.0.0.0', () => {
        console.log(`🚀 KineticGP Server running in ${config_1.CONFIG.NODE_ENV} mode on http://0.0.0.0:${config_1.CONFIG.PORT}`);
    });
}
exports.default = app;

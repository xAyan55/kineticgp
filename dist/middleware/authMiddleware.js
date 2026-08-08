"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.redirectIfAuth = redirectIfAuth;
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
        return;
    }
    res.redirect('/login?err=unauthorized');
}
function redirectIfAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    next();
}

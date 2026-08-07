"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.csrfProtection = csrfProtection;
const crypto_1 = __importDefault(require("crypto"));
function csrfProtection(req, res, next) {
    // 1. Determine or create persistent CSRF token from Cookie or Session
    let token = req.cookies?._csrf || req.session?.csrfSecret;
    if (!token) {
        token = crypto_1.default.randomBytes(24).toString('hex');
    }
    // Persist token in session and httpOnly cookie to survive PM2 server restarts
    if (req.session) {
        req.session.csrfSecret = token;
    }
    res.cookie('_csrf', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    res.locals.csrfToken = token;
    res.locals._csrf = token;
    // 2. Validate token on state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const clientToken = req.body?._csrf || req.headers['x-csrf-token'];
        const validToken = token;
        const cookieToken = req.cookies?._csrf;
        const sessionToken = req.session?.csrfSecret;
        const isValid = clientToken && (clientToken === validToken ||
            clientToken === cookieToken ||
            clientToken === sessionToken);
        if (!isValid) {
            console.warn(`⚠️ CSRF mismatch for ${req.path}: Client=[${clientToken}] expected=[${validToken}]`);
            const referer = req.header('Referer');
            if (referer) {
                const sep = referer.includes('?') ? '&' : '?';
                res.redirect(`${referer}${sep}err=csrf_expired`);
                return;
            }
            res.status(403).send('CSRF Token Expired. Please refresh and try again.');
            return;
        }
    }
    next();
}

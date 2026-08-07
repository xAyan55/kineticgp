"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.csrfProtection = csrfProtection;
const crypto_1 = __importDefault(require("crypto"));
function csrfProtection(req, res, next) {
    if (!req.session) {
        return next();
    }
    if (!req.session.csrfSecret) {
        req.session.csrfSecret = crypto_1.default.randomBytes(24).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfSecret;
    res.locals._csrf = req.session.csrfSecret;
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const clientToken = req.body?._csrf || req.headers['x-csrf-token'];
        if (!clientToken || clientToken !== req.session.csrfSecret) {
            res.status(403).send('Invalid CSRF Token. Please refresh the page and try again.');
            return;
        }
    }
    next();
}

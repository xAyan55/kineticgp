"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
exports.CONFIG = {
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    SESSION_SECRET: process.env.SESSION_SECRET || 'kineticgp-super-secret-key-2026-production-ready',
    DB_PATH: process.env.DB_PATH || path_1.default.join(process.cwd(), 'storage', 'database.sqlite'),
    AVATARS: [
        '/images/banners/big-steve-face.png',
        '/images/banners/big-alex-face.png'
    ],
    DEFAULT_BANNER: '/images/banners/account-banner.png'
};

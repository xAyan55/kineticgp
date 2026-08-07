import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SESSION_SECRET: process.env.SESSION_SECRET || 'kineticgp-super-secret-key-2026-production-ready',
  DB_PATH: process.env.DB_PATH || path.join(process.cwd(), 'storage', 'database.sqlite'),
  AVATARS: [
    '/images/banners/big-steve-face.png',
    '/images/banners/big-alex-face.png'
  ],
  DEFAULT_BANNER: '/images/banners/account-banner.png'
};

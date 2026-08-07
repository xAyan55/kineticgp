import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

const storageDir = path.dirname(CONFIG.DB_PATH);
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

export const db = new Database(CONFIG.DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

export function initDatabase(): void {
  // Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT NOT NULL,
      banner TEXT NOT NULL DEFAULT '/images/banners/account-banner.png',
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      last_login DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Auto-migration for users table columns if missing
  try {
    const userColumns = db.pragma('table_info(users)') as { name: string }[];
    const columnNames = userColumns.map(c => c.name);
    if (!columnNames.includes('status')) {
      db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
    }
    if (!columnNames.includes('last_login')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_login DATETIME DEFAULT NULL`);
    }
  } catch (e) {
    console.error('Migration warning (users table):', e);
  }

  // Nodes Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Local Node',
      hostname TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
      status TEXT NOT NULL DEFAULT 'online',
      cpu_usage REAL DEFAULT 0,
      memory_usage INTEGER DEFAULT 0,
      memory_total INTEGER DEFAULT 0,
      disk_usage REAL DEFAULT 0,
      disk_total REAL DEFAULT 0,
      is_local INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Plans Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      memory_limit INTEGER NOT NULL DEFAULT 2048,
      cpu_limit INTEGER NOT NULL DEFAULT 100,
      disk_limit INTEGER NOT NULL DEFAULT 10,
      max_servers INTEGER NOT NULL DEFAULT 3,
      max_backups INTEGER NOT NULL DEFAULT 5,
      max_databases INTEGER NOT NULL DEFAULT 2,
      max_allocations INTEGER NOT NULL DEFAULT 5,
      price REAL NOT NULL DEFAULT 0.00,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
  `);

  // Servers Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      game TEXT NOT NULL DEFAULT 'Minecraft',
      status TEXT NOT NULL DEFAULT 'online',
      ip_address TEXT NOT NULL,
      port INTEGER NOT NULL,
      players_online INTEGER DEFAULT 0,
      max_players INTEGER DEFAULT 20,
      cpu_usage REAL DEFAULT 0,
      memory_usage INTEGER DEFAULT 0,
      max_memory INTEGER DEFAULT 4096,
      disk_usage REAL DEFAULT 0,
      max_disk INTEGER DEFAULT 50,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_servers_user_id ON servers(user_id);
  `);

  // Activity Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT DEFAULT '127.0.0.1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at DESC);
  `);

  // Seed default settings if missing
  const defaultSettings: Record<string, string> = {
    panel_name: 'KineticGP',
    company_name: 'KineticHost',
    site_title: 'KineticGP — Self-Hosted Minecraft Server Panel',
    site_description: 'High-performance self-hosted Minecraft server management panel.',
    site_logo: '/images/logo.svg',
    site_favicon: '/images/favicon.png',
    hero_bg_video: '/bg.mp4',
    hero_art: '/mc-art.png',
    review_bg: '/review-bg.png',
    login_bg: '/auth-bg.png',
    profile_banner: '/images/banners/account-banner.png',
    overview_banner: '/images/banners/overview.jpg',
    primary_color: '#1873d3',
    accent_color: '#10b981',
    footer_text: '© 2026 KineticHost. All rights reserved.',
    discord_link: 'https://discord.gg/kinetichost',
    twitter_link: 'https://twitter.com/kinetichost',
    github_link: 'https://github.com/xAyan55/kineticgp',
    allow_registration: 'true',
    default_avatar_strategy: 'random'
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Seed default plans if empty
  const planCheck = db.prepare('SELECT COUNT(*) as count FROM plans');
  const planRes = planCheck.get() as { count: number };
  if (planRes.count === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO plans (name, description, memory_limit, cpu_limit, disk_limit, max_servers, max_backups, max_databases, max_allocations, price, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertPlan.run('Starter Node', 'Basic Minecraft server hosting plan for small groups.', 2048, 100, 10, 1, 3, 1, 3, 0.00);
    insertPlan.run('Pro SMP Cluster', 'High performance plan for active SMP communities.', 8192, 250, 50, 3, 10, 5, 10, 9.99);
    insertPlan.run('Enterprise Network', 'Unlimited server allocations for gaming networks.', 32768, 800, 200, 10, 30, 20, 30, 29.99);
  }

  console.log('⚡ SQLite Database initialized successfully with tables and indexes.');
}

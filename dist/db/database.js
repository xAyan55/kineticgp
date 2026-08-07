"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initDatabase = initDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const storageDir = path_1.default.dirname(config_1.CONFIG.DB_PATH);
if (!fs_1.default.existsSync(storageDir)) {
    fs_1.default.mkdirSync(storageDir, { recursive: true });
}
exports.db = new better_sqlite3_1.default(config_1.CONFIG.DB_PATH);
exports.db.pragma('foreign_keys = ON');
exports.db.pragma('journal_mode = WAL');
function initDatabase() {
    // Users Table
    exports.db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT NOT NULL,
      banner TEXT NOT NULL DEFAULT '/images/banners/account-banner.png',
      role TEXT NOT NULL DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
    // Settings Table
    exports.db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
  `);
    // Servers Table
    exports.db.exec(`
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
    exports.db.exec(`
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
    // Seed default settings if empty
    const countStmt = exports.db.prepare('SELECT COUNT(*) as count FROM settings');
    const result = countStmt.get();
    if (result.count === 0) {
        const insertSetting = exports.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        insertSetting.run('site_title', 'KineticGP Panel');
        insertSetting.run('site_description', 'Modern Self-Hosted Minecraft Server Management Panel');
        insertSetting.run('allow_registration', 'true');
        insertSetting.run('default_avatar_strategy', 'random');
    }
    console.log('⚡ SQLite Database initialized successfully with tables and indexes.');
}

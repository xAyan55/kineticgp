"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingModel = void 0;
const database_1 = require("../db/database");
class SettingModel {
    static get(key, defaultValue = '') {
        const stmt = database_1.db.prepare('SELECT value FROM settings WHERE key = ?');
        const row = stmt.get(key);
        return row ? row.value : defaultValue;
    }
    static set(key, value) {
        const stmt = database_1.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
        stmt.run(key, value);
    }
    static getAll() {
        const stmt = database_1.db.prepare('SELECT key, value FROM settings');
        const rows = stmt.all();
        const result = {};
        for (const r of rows) {
            result[r.key] = r.value;
        }
        return result;
    }
}
exports.SettingModel = SettingModel;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingModel = void 0;
const database_1 = require("../db/database");
class SettingModel {
    static getAll() {
        const stmt = database_1.db.prepare('SELECT * FROM settings');
        const rows = stmt.all();
        const map = {};
        for (const row of rows) {
            map[row.key] = row.value;
        }
        return map;
    }
    static get(key, fallback = '') {
        const stmt = database_1.db.prepare('SELECT value FROM settings WHERE key = ?');
        const row = stmt.get(key);
        return row ? row.value : fallback;
    }
    static set(key, value) {
        const stmt = database_1.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
        stmt.run(key, value);
    }
    static setMany(settingsObj) {
        const stmt = database_1.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
        const transaction = database_1.db.transaction((entries) => {
            for (const [key, val] of entries) {
                stmt.run(key, val);
            }
        });
        transaction(Object.entries(settingsObj));
    }
}
exports.SettingModel = SettingModel;

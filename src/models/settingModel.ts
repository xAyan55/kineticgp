import { db } from '../db/database';
import { Setting } from '../types';

export class SettingModel {
  static getAll(): Record<string, string> {
    const stmt = db.prepare('SELECT * FROM settings');
    const rows = stmt.all() as Setting[];
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  static get(key: string, fallback: string = ''): string {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : fallback;
  }

  static set(key: string, value: string): void {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value);
  }

  static setMany(settingsObj: Record<string, string>): void {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    const transaction = db.transaction((entries: [string, string][]) => {
      for (const [key, val] of entries) {
        stmt.run(key, val);
      }
    });
    transaction(Object.entries(settingsObj));
  }
}

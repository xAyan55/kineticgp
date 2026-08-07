"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityModel = void 0;
const database_1 = require("../db/database");
class ActivityModel {
    static getRecentByUserId(userId, limit = 10) {
        const stmt = database_1.db.prepare(`
      SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?
    `);
        return stmt.all(userId, limit);
    }
    static log(userId, username, action, details, ipAddress = '127.0.0.1') {
        const stmt = database_1.db.prepare(`
      INSERT INTO activity_logs (user_id, username, action, details, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(userId, username, action, details, ipAddress);
    }
    static countAll() {
        const stmt = database_1.db.prepare('SELECT COUNT(*) as count FROM activity_logs');
        return stmt.get().count;
    }
    static findAll(options) {
        let query = 'SELECT * FROM activity_logs WHERE 1=1';
        const params = [];
        if (options?.search) {
            query += ' AND (LOWER(username) LIKE LOWER(?) OR LOWER(action) LIKE LOWER(?) OR LOWER(details) LIKE LOWER(?) OR LOWER(ip_address) LIKE LOWER(?))';
            params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
        }
        if (options?.action) {
            query += ' AND action = ?';
            params.push(options.action);
        }
        query += ' ORDER BY id DESC';
        if (options?.page && options?.limit) {
            const offset = (options.page - 1) * options.limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(options.limit, offset);
        }
        const stmt = database_1.db.prepare(query);
        return stmt.all(...params);
    }
    static countFiltered(options) {
        let query = 'SELECT COUNT(*) as count FROM activity_logs WHERE 1=1';
        const params = [];
        if (options?.search) {
            query += ' AND (LOWER(username) LIKE LOWER(?) OR LOWER(action) LIKE LOWER(?) OR LOWER(details) LIKE LOWER(?) OR LOWER(ip_address) LIKE LOWER(?))';
            params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
        }
        if (options?.action) {
            query += ' AND action = ?';
            params.push(options.action);
        }
        const stmt = database_1.db.prepare(query);
        return stmt.get(...params).count;
    }
    static getDistinctActions() {
        const stmt = database_1.db.prepare('SELECT DISTINCT action FROM activity_logs ORDER BY action ASC');
        const rows = stmt.all();
        return rows.map(r => r.action);
    }
}
exports.ActivityModel = ActivityModel;

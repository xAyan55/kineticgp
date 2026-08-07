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
}
exports.ActivityModel = ActivityModel;

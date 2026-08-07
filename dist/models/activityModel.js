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
    static seedDemoLogsIfEmpty(userId, username) {
        const checkStmt = database_1.db.prepare('SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ?');
        const res = checkStmt.get(userId);
        if (res.count === 0) {
            this.log(userId, username, 'SERVER_START', 'Started "Survival SMP Node" (Paper 1.20.4)');
            this.log(userId, username, 'CONFIG_UPDATE', 'Updated server.properties max-players to 30');
            this.log(userId, username, 'BACKUP_CREATE', 'Created scheduled automatic world backup #142');
            this.log(userId, username, 'USER_LOGIN', 'User authenticated successfully from 192.168.1.50');
        }
    }
}
exports.ActivityModel = ActivityModel;

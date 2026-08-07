import { db } from '../db/database';
import { ActivityLog } from '../types';

export class ActivityModel {
  static getRecentByUserId(userId: number, limit: number = 10): ActivityLog[] {
    const stmt = db.prepare(`
      SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?
    `);
    return stmt.all(userId, limit) as ActivityLog[];
  }

  static log(userId: number, username: string, action: string, details: string, ipAddress: string = '127.0.0.1'): void {
    const stmt = db.prepare(`
      INSERT INTO activity_logs (user_id, username, action, details, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId, username, action, details, ipAddress);
  }

  static seedDemoLogsIfEmpty(userId: number, username: string): void {
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ?');
    const res = checkStmt.get(userId) as { count: number };

    if (res.count === 0) {
      this.log(userId, username, 'SERVER_START', 'Started "Survival SMP Node" (Paper 1.20.4)');
      this.log(userId, username, 'CONFIG_UPDATE', 'Updated server.properties max-players to 30');
      this.log(userId, username, 'BACKUP_CREATE', 'Created scheduled automatic world backup #142');
      this.log(userId, username, 'USER_LOGIN', 'User authenticated successfully from 192.168.1.50');
    }
  }
}

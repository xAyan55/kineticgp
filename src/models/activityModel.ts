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
}

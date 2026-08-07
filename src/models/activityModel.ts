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

  static countAll(): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM activity_logs');
    return (stmt.get() as { count: number }).count;
  }

  static findAll(options?: {
    search?: string;
    action?: string;
    page?: number;
    limit?: number;
  }): ActivityLog[] {
    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const params: any[] = [];

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

    const stmt = db.prepare(query);
    return stmt.all(...params) as ActivityLog[];
  }

  static countFiltered(options?: { search?: string; action?: string }): number {
    let query = 'SELECT COUNT(*) as count FROM activity_logs WHERE 1=1';
    const params: any[] = [];

    if (options?.search) {
      query += ' AND (LOWER(username) LIKE LOWER(?) OR LOWER(action) LIKE LOWER(?) OR LOWER(details) LIKE LOWER(?) OR LOWER(ip_address) LIKE LOWER(?))';
      params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }

    if (options?.action) {
      query += ' AND action = ?';
      params.push(options.action);
    }

    const stmt = db.prepare(query);
    return (stmt.get(...params) as { count: number }).count;
  }

  static getDistinctActions(): string[] {
    const stmt = db.prepare('SELECT DISTINCT action FROM activity_logs ORDER BY action ASC');
    const rows = stmt.all() as { action: string }[];
    return rows.map(r => r.action);
  }
}

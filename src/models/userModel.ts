import { db } from '../db/database';
import { User } from '../types';

export class UserModel {
  static countAll(): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
    return (stmt.get() as { count: number }).count;
  }

  static countActive(): number {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active' AND deleted_at IS NULL");
    return (stmt.get() as { count: number }).count;
  }

  static countSuspended(): number {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'suspended' AND deleted_at IS NULL");
    return (stmt.get() as { count: number }).count;
  }

  static countSuperAdmins(): number {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'superadmin' AND deleted_at IS NULL");
    return (stmt.get() as { count: number }).count;
  }

  static findById(id: number): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL');
    return (stmt.get(id) as User) || null;
  }

  static findByUsername(username: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND deleted_at IS NULL');
    return (stmt.get(username) as User) || null;
  }

  static findByEmail(email: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL');
    return (stmt.get(email) as User) || null;
  }

  static findAll(options?: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): User[] {
    let query = 'SELECT * FROM users WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (options?.search) {
      query += ' AND (LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))';
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    if (options?.role) {
      query += ' AND role = ?';
      params.push(options.role);
    }

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY id DESC';

    if (options?.page && options?.limit) {
      const offset = (options.page - 1) * options.limit;
      query += ' LIMIT ? OFFSET ?';
      params.push(options.limit, offset);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params) as User[];
  }

  static countFiltered(options?: { search?: string; role?: string; status?: string }): number {
    let query = 'SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (options?.search) {
      query += ' AND (LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))';
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    if (options?.role) {
      query += ' AND role = ?';
      params.push(options.role);
    }

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    const stmt = db.prepare(query);
    return (stmt.get(...params) as { count: number }).count;
  }

  static create(data: {
    username: string;
    email: string;
    password_hash: string;
    avatar: string;
    banner?: string;
    role?: 'superadmin' | 'admin' | 'user';
  }): User {
    const totalUsers = this.countAll();
    const role = data.role || (totalUsers === 0 ? 'superadmin' : 'user');
    const banner = data.banner || '/images/banners/account-banner.png';

    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, avatar, banner, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
    const info = stmt.run(data.username, data.email, data.password_hash, data.avatar, banner, role);
    return this.findById(info.lastInsertRowid as number)!;
  }

  static updateRole(id: number, role: 'superadmin' | 'admin' | 'user'): boolean {
    const stmt = db.prepare(`
      UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(role, id);
    return result.changes > 0;
  }

  static updateStatus(id: number, status: 'active' | 'suspended'): boolean {
    const stmt = db.prepare(`
      UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(status, id);
    return result.changes > 0;
  }

  static updateLastLogin(id: number): boolean {
    const stmt = db.prepare(`
      UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static updateUsername(id: number, username: string): boolean {
    const stmt = db.prepare(`
      UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(username, id);
    return result.changes > 0;
  }

  static updateEmail(id: number, email: string): boolean {
    const stmt = db.prepare(`
      UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(email, id);
    return result.changes > 0;
  }

  static updatePassword(id: number, password_hash: string): boolean {
    const stmt = db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(password_hash, id);
    return result.changes > 0;
  }

  static updateAvatar(id: number, avatar: string): boolean {
    const stmt = db.prepare(`
      UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(avatar, id);
    return result.changes > 0;
  }

  static softDelete(id: number): boolean {
    const stmt = db.prepare(`
      UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

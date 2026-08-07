import { db } from '../db/database';
import { User } from '../types';

export class UserModel {
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

  static create(data: {
    username: string;
    email: string;
    password_hash: string;
    avatar: string;
    banner?: string;
  }): User {
    const banner = data.banner || '/images/banners/account-banner.png';
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, avatar, banner)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(data.username, data.email, data.password_hash, data.avatar, banner);
    return this.findById(info.lastInsertRowid as number)!;
  }

  static updateUsername(id: number, username: string): boolean {
    const stmt = db.prepare(`
      UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
    const result = stmt.run(username, id);
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

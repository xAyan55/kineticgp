"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const database_1 = require("../db/database");
class UserModel {
    static countAll() {
        const stmt = database_1.db.prepare('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
        return stmt.get().count;
    }
    static countActive() {
        const stmt = database_1.db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active' AND deleted_at IS NULL");
        return stmt.get().count;
    }
    static countSuspended() {
        const stmt = database_1.db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'suspended' AND deleted_at IS NULL");
        return stmt.get().count;
    }
    static countSuperAdmins() {
        const stmt = database_1.db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'superadmin' AND deleted_at IS NULL");
        return stmt.get().count;
    }
    static findById(id) {
        const stmt = database_1.db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL');
        return stmt.get(id) || null;
    }
    static findByUsername(username) {
        const stmt = database_1.db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND deleted_at IS NULL');
        return stmt.get(username) || null;
    }
    static findByEmail(email) {
        const stmt = database_1.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL');
        return stmt.get(email) || null;
    }
    static findAll(options) {
        let query = 'SELECT * FROM users WHERE deleted_at IS NULL';
        const params = [];
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
        const stmt = database_1.db.prepare(query);
        return stmt.all(...params);
    }
    static countFiltered(options) {
        let query = 'SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL';
        const params = [];
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
        const stmt = database_1.db.prepare(query);
        return stmt.get(...params).count;
    }
    static create(data) {
        const totalUsers = this.countAll();
        const role = data.role || (totalUsers === 0 ? 'superadmin' : 'user');
        const banner = data.banner || '/images/banners/account-banner.png';
        const stmt = database_1.db.prepare(`
      INSERT INTO users (username, email, password_hash, avatar, banner, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
        const info = stmt.run(data.username, data.email, data.password_hash, data.avatar, banner, role);
        return this.findById(info.lastInsertRowid);
    }
    static updateRole(id, role) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(role, id);
        return result.changes > 0;
    }
    static updateStatus(id, status) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(status, id);
        return result.changes > 0;
    }
    static updateLastLogin(id) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(id);
        return result.changes > 0;
    }
    static updateUsername(id, username) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(username, id);
        return result.changes > 0;
    }
    static updateEmail(id, email) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(email, id);
        return result.changes > 0;
    }
    static updatePassword(id, password_hash) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(password_hash, id);
        return result.changes > 0;
    }
    static updateAvatar(id, avatar) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(avatar, id);
        return result.changes > 0;
    }
    static softDelete(id) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
        const result = stmt.run(id);
        return result.changes > 0;
    }
}
exports.UserModel = UserModel;

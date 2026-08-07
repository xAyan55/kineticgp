"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const database_1 = require("../db/database");
class UserModel {
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
    static create(data) {
        const banner = data.banner || '/images/banners/account-banner.png';
        const stmt = database_1.db.prepare(`
      INSERT INTO users (username, email, password_hash, avatar, banner)
      VALUES (?, ?, ?, ?, ?)
    `);
        const info = stmt.run(data.username, data.email, data.password_hash, data.avatar, banner);
        return this.findById(info.lastInsertRowid);
    }
    static updateUsername(id, username) {
        const stmt = database_1.db.prepare(`
      UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `);
        const result = stmt.run(username, id);
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

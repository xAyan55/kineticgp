"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerModel = void 0;
const database_1 = require("../db/database");
class ServerModel {
    static countAll() {
        const stmt = database_1.db.prepare('SELECT COUNT(*) as count FROM servers');
        return stmt.get().count;
    }
    static countOnline() {
        const stmt = database_1.db.prepare("SELECT COUNT(*) as count FROM servers WHERE status = 'online'");
        return stmt.get().count;
    }
    static countOffline() {
        const stmt = database_1.db.prepare("SELECT COUNT(*) as count FROM servers WHERE status = 'offline'");
        return stmt.get().count;
    }
    static findAll() {
        const stmt = database_1.db.prepare('SELECT * FROM servers ORDER BY id DESC');
        return stmt.all();
    }
    static findByUserId(userId) {
        const stmt = database_1.db.prepare('SELECT * FROM servers WHERE user_id = ? ORDER BY id ASC');
        return stmt.all(userId);
    }
    static findById(id, userId) {
        if (userId !== undefined) {
            const stmt = database_1.db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?');
            return stmt.get(id, userId) || null;
        }
        const stmt = database_1.db.prepare('SELECT * FROM servers WHERE id = ?');
        return stmt.get(id) || null;
    }
    static updateStatus(id, userId, status) {
        let cpu = 0;
        let memory = 0;
        let players = 0;
        if (status === 'online') {
            cpu = Math.floor(Math.random() * 25) + 15;
            memory = Math.floor(Math.random() * 1000) + 2000;
            players = Math.floor(Math.random() * 12) + 4;
        }
        else if (status === 'starting') {
            cpu = 65;
            memory = 1500;
            players = 0;
        }
        else if (status === 'stopping') {
            cpu = 30;
            memory = 800;
            players = 0;
        }
        const stmt = database_1.db.prepare(`
      UPDATE servers 
      SET status = ?, cpu_usage = ?, memory_usage = ?, players_online = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `);
        const result = stmt.run(status, cpu, memory, players, id, userId);
        return result.changes > 0;
    }
}
exports.ServerModel = ServerModel;

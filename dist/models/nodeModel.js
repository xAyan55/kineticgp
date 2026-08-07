"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeModel = void 0;
const database_1 = require("../db/database");
class NodeModel {
    static getLocalNode() {
        const stmt = database_1.db.prepare('SELECT * FROM nodes WHERE is_local = 1 LIMIT 1');
        return stmt.get() || null;
    }
    static findAll() {
        const stmt = database_1.db.prepare('SELECT * FROM nodes ORDER BY is_local DESC, id ASC');
        return stmt.all();
    }
    static upsertLocalNode(data) {
        const existing = this.getLocalNode();
        if (existing) {
            const stmt = database_1.db.prepare(`
        UPDATE nodes 
        SET hostname = ?, ip_address = ?, status = ?, cpu_usage = ?, memory_usage = ?, memory_total = ?, disk_usage = ?, disk_total = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
            stmt.run(data.hostname, data.ip_address, data.status, data.cpu_usage, data.memory_usage, data.memory_total, data.disk_usage, data.disk_total, existing.id);
            return this.getLocalNode();
        }
        else {
            const stmt = database_1.db.prepare(`
        INSERT INTO nodes (name, hostname, ip_address, status, cpu_usage, memory_usage, memory_total, disk_usage, disk_total, is_local)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
            const info = stmt.run(data.name || 'Local Node', data.hostname, data.ip_address, data.status, data.cpu_usage, data.memory_usage, data.memory_total, data.disk_usage, data.disk_total);
            return database_1.db.prepare('SELECT * FROM nodes WHERE id = ?').get(info.lastInsertRowid);
        }
    }
}
exports.NodeModel = NodeModel;

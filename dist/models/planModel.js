"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanModel = void 0;
const database_1 = require("../db/database");
class PlanModel {
    static findAll() {
        const stmt = database_1.db.prepare('SELECT * FROM plans ORDER BY id ASC');
        return stmt.all();
    }
    static findEnabled() {
        const stmt = database_1.db.prepare('SELECT * FROM plans WHERE is_enabled = 1 ORDER BY id ASC');
        return stmt.all();
    }
    static findById(id) {
        const stmt = database_1.db.prepare('SELECT * FROM plans WHERE id = ?');
        return stmt.get(id) || null;
    }
    static create(data) {
        const stmt = database_1.db.prepare(`
      INSERT INTO plans (name, description, memory_limit, cpu_limit, disk_limit, max_servers, max_backups, max_databases, max_allocations, price, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const info = stmt.run(data.name, data.description || '', data.memory_limit, data.cpu_limit, data.disk_limit, data.max_servers, data.max_backups, data.max_databases, data.max_allocations, data.price || 0, data.is_enabled !== undefined ? data.is_enabled : 1);
        return this.findById(info.lastInsertRowid);
    }
    static update(id, data) {
        const stmt = database_1.db.prepare(`
      UPDATE plans 
      SET name = ?, description = ?, memory_limit = ?, cpu_limit = ?, disk_limit = ?, max_servers = ?, max_backups = ?, max_databases = ?, max_allocations = ?, price = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
        const result = stmt.run(data.name, data.description || '', data.memory_limit, data.cpu_limit, data.disk_limit, data.max_servers, data.max_backups, data.max_databases, data.max_allocations, data.price || 0, data.is_enabled !== undefined ? data.is_enabled : 1, id);
        return result.changes > 0;
    }
    static toggleEnabled(id) {
        const plan = this.findById(id);
        if (!plan)
            return false;
        const newStatus = plan.is_enabled === 1 ? 0 : 1;
        const stmt = database_1.db.prepare('UPDATE plans SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const result = stmt.run(newStatus, id);
        return result.changes > 0;
    }
    static duplicate(id) {
        const plan = this.findById(id);
        if (!plan)
            return null;
        return this.create({
            name: `${plan.name} (Copy)`,
            description: plan.description,
            memory_limit: plan.memory_limit,
            cpu_limit: plan.cpu_limit,
            disk_limit: plan.disk_limit,
            max_servers: plan.max_servers,
            max_backups: plan.max_backups,
            max_databases: plan.max_databases,
            max_allocations: plan.max_allocations,
            price: plan.price,
            is_enabled: plan.is_enabled
        });
    }
    static delete(id) {
        const stmt = database_1.db.prepare('DELETE FROM plans WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
}
exports.PlanModel = PlanModel;

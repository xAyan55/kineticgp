import { db } from '../db/database';
import { Plan } from '../types';

export class PlanModel {
  static findAll(): Plan[] {
    const stmt = db.prepare('SELECT * FROM plans ORDER BY id ASC');
    return stmt.all() as Plan[];
  }

  static findEnabled(): Plan[] {
    const stmt = db.prepare('SELECT * FROM plans WHERE is_enabled = 1 ORDER BY id ASC');
    return stmt.all() as Plan[];
  }

  static findById(id: number): Plan | null {
    const stmt = db.prepare('SELECT * FROM plans WHERE id = ?');
    return (stmt.get(id) as Plan) || null;
  }

  static create(data: {
    name: string;
    description?: string;
    memory_limit: number;
    cpu_limit: number;
    disk_limit: number;
    max_servers: number;
    max_backups: number;
    max_databases: number;
    max_allocations: number;
    price?: number;
    is_enabled?: number;
  }): Plan {
    const stmt = db.prepare(`
      INSERT INTO plans (name, description, memory_limit, cpu_limit, disk_limit, max_servers, max_backups, max_databases, max_allocations, price, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      data.name,
      data.description || '',
      data.memory_limit,
      data.cpu_limit,
      data.disk_limit,
      data.max_servers,
      data.max_backups,
      data.max_databases,
      data.max_allocations,
      data.price || 0,
      data.is_enabled !== undefined ? data.is_enabled : 1
    );
    return this.findById(info.lastInsertRowid as number)!;
  }

  static update(id: number, data: {
    name: string;
    description?: string;
    memory_limit: number;
    cpu_limit: number;
    disk_limit: number;
    max_servers: number;
    max_backups: number;
    max_databases: number;
    max_allocations: number;
    price?: number;
    is_enabled?: number;
  }): boolean {
    const stmt = db.prepare(`
      UPDATE plans 
      SET name = ?, description = ?, memory_limit = ?, cpu_limit = ?, disk_limit = ?, max_servers = ?, max_backups = ?, max_databases = ?, max_allocations = ?, price = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(
      data.name,
      data.description || '',
      data.memory_limit,
      data.cpu_limit,
      data.disk_limit,
      data.max_servers,
      data.max_backups,
      data.max_databases,
      data.max_allocations,
      data.price || 0,
      data.is_enabled !== undefined ? data.is_enabled : 1,
      id
    );
    return result.changes > 0;
  }

  static toggleEnabled(id: number): boolean {
    const plan = this.findById(id);
    if (!plan) return false;
    const newStatus = plan.is_enabled === 1 ? 0 : 1;
    const stmt = db.prepare('UPDATE plans SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const result = stmt.run(newStatus, id);
    return result.changes > 0;
  }

  static duplicate(id: number): Plan | null {
    const plan = this.findById(id);
    if (!plan) return null;
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

  static delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM plans WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

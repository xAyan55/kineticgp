import { db } from '../db/database';
import { NodeInfo } from '../types';

export class NodeModel {
  static getLocalNode(): NodeInfo | null {
    const stmt = db.prepare('SELECT * FROM nodes WHERE is_local = 1 LIMIT 1');
    return (stmt.get() as NodeInfo) || null;
  }

  static findAll(): NodeInfo[] {
    const stmt = db.prepare('SELECT * FROM nodes ORDER BY is_local DESC, id ASC');
    return stmt.all() as NodeInfo[];
  }

  static upsertLocalNode(data: {
    name?: string;
    hostname: string;
    ip_address: string;
    status: 'online' | 'offline' | 'degraded';
    cpu_usage: number;
    memory_usage: number;
    memory_total: number;
    disk_usage: number;
    disk_total: number;
  }): NodeInfo {
    const existing = this.getLocalNode();
    if (existing) {
      const stmt = db.prepare(`
        UPDATE nodes 
        SET hostname = ?, ip_address = ?, status = ?, cpu_usage = ?, memory_usage = ?, memory_total = ?, disk_usage = ?, disk_total = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(data.hostname, data.ip_address, data.status, data.cpu_usage, data.memory_usage, data.memory_total, data.disk_usage, data.disk_total, existing.id);
      return this.getLocalNode()!;
    } else {
      const stmt = db.prepare(`
        INSERT INTO nodes (name, hostname, ip_address, status, cpu_usage, memory_usage, memory_total, disk_usage, disk_total, is_local)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const info = stmt.run(data.name || 'Local Node', data.hostname, data.ip_address, data.status, data.cpu_usage, data.memory_usage, data.memory_total, data.disk_usage, data.disk_total);
      return (db.prepare('SELECT * FROM nodes WHERE id = ?').get(info.lastInsertRowid) as NodeInfo);
    }
  }
}

import { db } from '../db/database';
import { Server } from '../types';

export class ServerModel {
  static findByUserId(userId: number): Server[] {
    const stmt = db.prepare('SELECT * FROM servers WHERE user_id = ? ORDER BY id ASC');
    return stmt.all(userId) as Server[];
  }

  static findById(id: number, userId: number): Server | null {
    const stmt = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?');
    return (stmt.get(id, userId) as Server) || null;
  }

  static updateStatus(id: number, userId: number, status: 'online' | 'starting' | 'stopping' | 'offline'): boolean {
    let cpu = 0;
    let memory = 0;
    let players = 0;

    if (status === 'online') {
      cpu = Math.floor(Math.random() * 25) + 15;
      memory = Math.floor(Math.random() * 1000) + 2000;
      players = Math.floor(Math.random() * 12) + 4;
    } else if (status === 'starting') {
      cpu = 65;
      memory = 1500;
      players = 0;
    } else if (status === 'stopping') {
      cpu = 30;
      memory = 800;
      players = 0;
    }

    const stmt = db.prepare(`
      UPDATE servers 
      SET status = ?, cpu_usage = ?, memory_usage = ?, players_online = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `);
    const result = stmt.run(status, cpu, memory, players, id, userId);
    return result.changes > 0;
  }
}

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

  static seedDemoServersIfEmpty(userId: number): void {
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM servers WHERE user_id = ?');
    const res = checkStmt.get(userId) as { count: number };

    if (res.count === 0) {
      const insert = db.prepare(`
        INSERT INTO servers (name, game, status, ip_address, port, players_online, max_players, cpu_usage, memory_usage, max_memory, disk_usage, max_disk, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insert.run('Survival SMP Node', 'Minecraft 1.20.4', 'online', 'play.kinetichost.pro', 25565, 14, 30, 24.5, 3420, 8192, 18.4, 100, userId);
      insert.run('SkyBlock Alpha', 'Minecraft Paper 1.20', 'online', 'sb.kinetichost.pro', 25566, 8, 20, 18.2, 2150, 4096, 12.1, 50, userId);
      insert.run('Creative Build Realm', 'Minecraft Spigot 1.20', 'offline', 'build.kinetichost.pro', 25567, 0, 15, 0.0, 0, 4096, 8.7, 40, userId);
    }
  }
}

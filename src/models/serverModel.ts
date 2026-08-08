import crypto from 'crypto';
import path from 'path';
import { db } from '../db/database';
import { Server } from '../types';

export class ServerModel {
  static countAll(): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM servers');
    return (stmt.get() as { count: number }).count;
  }

  static countOnline(): number {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM servers WHERE status = 'online'");
    return (stmt.get() as { count: number }).count;
  }

  static countOffline(): number {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM servers WHERE status = 'offline'");
    return (stmt.get() as { count: number }).count;
  }

  static generateNextPort(): number {
    const stmt = db.prepare('SELECT MAX(port) as maxPort FROM servers');
    const row = stmt.get() as { maxPort: number | null };
    const basePort = (row && row.maxPort) ? row.maxPort + 1 : 25565;
    return basePort < 25565 ? 25565 : basePort;
  }

  static findByUuid(uuid: string): Server | null {
    const stmt = db.prepare(`
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.uuid = ?
    `);
    return (stmt.get(uuid) as Server) || null;
  }

  static findById(id: number): Server | null {
    const stmt = db.prepare(`
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.id = ?
    `);
    return (stmt.get(id) as Server) || null;
  }

  static findByUserId(userId: number): Server[] {
    const stmt = db.prepare(`
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.user_id = ? AND s.suspended = 0
      ORDER BY s.id ASC
    `);
    return stmt.all(userId) as Server[];
  }

  static findAll(options?: {
    search?: string;
    software?: string;
    status?: string;
    userId?: number;
    sort?: string;
    page?: number;
    limit?: number;
  }): Server[] {
    let query = `
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.search) {
      query += ' AND (LOWER(s.name) LIKE LOWER(?) OR LOWER(s.uuid) LIKE LOWER(?) OR LOWER(u.username) LIKE LOWER(?))';
      params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }

    if (options?.software) {
      query += ' AND s.software = ?';
      params.push(options.software);
    }

    if (options?.status) {
      query += ' AND s.status = ?';
      params.push(options.status);
    }

    if (options?.userId) {
      query += ' AND s.user_id = ?';
      params.push(options.userId);
    }

    // Sorting options
    if (options?.sort === 'owner') {
      query += ' ORDER BY u.username ASC';
    } else if (options?.sort === 'status') {
      query += ' ORDER BY s.status DESC';
    } else if (options?.sort === 'version') {
      query += ' ORDER BY s.version DESC';
    } else {
      query += ' ORDER BY s.id DESC';
    }

    if (options?.page && options?.limit) {
      const offset = (options.page - 1) * options.limit;
      query += ' LIMIT ? OFFSET ?';
      params.push(options.limit, offset);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params) as Server[];
  }

  static countFiltered(options?: { search?: string; software?: string; status?: string; userId?: number }): number {
    let query = `
      SELECT COUNT(*) as count 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.search) {
      query += ' AND (LOWER(s.name) LIKE LOWER(?) OR LOWER(s.uuid) LIKE LOWER(?) OR LOWER(u.username) LIKE LOWER(?))';
      params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
    }

    if (options?.software) {
      query += ' AND s.software = ?';
      params.push(options.software);
    }

    if (options?.status) {
      query += ' AND s.status = ?';
      params.push(options.status);
    }

    if (options?.userId) {
      query += ' AND s.user_id = ?';
      params.push(options.userId);
    }

    const stmt = db.prepare(query);
    return (stmt.get(...params) as { count: number }).count;
  }

  static create(data: {
    user_id: number;
    name: string;
    description?: string;
    version?: string;
    software?: string;
    java_version?: string;
    ram_limit?: number;
    cpu_limit?: number;
    disk_limit?: number;
  }): Server {
    const uuid = crypto.randomUUID();
    const port = this.generateNextPort();
    const directory = path.join(process.cwd(), 'storage', 'servers', uuid);
    const jar_file = 'server.jar';
    const version = data.version || '1.20.4';
    const software = data.software || 'Paper';
    const java_version = data.java_version || '21';
    const ram_limit = data.ram_limit || 2048;
    const cpu_limit = data.cpu_limit || 100;
    const disk_limit = data.disk_limit || 10;
    const startup_command = 'java -Xms128M -Xmx{ram}M -jar {jar_file} --nogui';

    const stmt = db.prepare(`
      INSERT INTO servers (uuid, user_id, name, description, game, version, software, java_version, ram_limit, cpu_limit, disk_limit, directory, jar_file, ip_address, port, startup_command, auto_restart, status)
      VALUES (?, ?, ?, ?, 'Minecraft', ?, ?, ?, ?, ?, ?, ?, ?, '127.0.0.1', ?, ?, 1, 'installing')
    `);

    const info = stmt.run(
      uuid,
      data.user_id,
      data.name,
      data.description || '',
      version,
      software,
      java_version,
      ram_limit,
      cpu_limit,
      disk_limit,
      directory,
      jar_file,
      port,
      startup_command
    );

    return this.findById(info.lastInsertRowid as number)!;
  }

  static updateStatus(id: number, status: Server['status']): boolean {
    const stmt = db.prepare('UPDATE servers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const result = stmt.run(status, id);
    return result.changes > 0;
  }

  static updateRuntimeState(id: number, status: Server['status'], pid: number | null): boolean {
    let query = 'UPDATE servers SET status = ?, pid = ?, updated_at = CURRENT_TIMESTAMP';
    if (status === 'online') {
      query += ', last_started = CURRENT_TIMESTAMP';
    } else if (status === 'offline') {
      query += ', last_stopped = CURRENT_TIMESTAMP, cpu_usage = 0, memory_usage = 0, players_online = 0';
    }
    query += ' WHERE id = ?';

    const stmt = db.prepare(query);
    const result = stmt.run(status, pid, id);
    return result.changes > 0;
  }

  static updateResources(id: number, cpu: number, memory: number, disk: number, players: number): boolean {
    const stmt = db.prepare(`
      UPDATE servers 
      SET cpu_usage = ?, memory_usage = ?, disk_usage = ?, players_online = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(cpu, memory, disk, players, id);
    return result.changes > 0;
  }

  static updateSettings(id: number, data: {
    name?: string;
    description?: string;
    ram_limit?: number;
    version?: string;
    software?: string;
    startup_command?: string;
    auto_restart?: number;
    java_version?: string;
  }): boolean {
    const server = this.findById(id);
    if (!server) return false;

    const stmt = db.prepare(`
      UPDATE servers 
      SET name = ?, description = ?, ram_limit = ?, version = ?, software = ?, startup_command = ?, auto_restart = ?, java_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(
      data.name !== undefined ? data.name : server.name,
      data.description !== undefined ? data.description : server.description,
      data.ram_limit !== undefined ? data.ram_limit : server.ram_limit,
      data.version !== undefined ? data.version : server.version,
      data.software !== undefined ? data.software : server.software,
      data.startup_command !== undefined ? data.startup_command : server.startup_command,
      data.auto_restart !== undefined ? data.auto_restart : server.auto_restart,
      data.java_version !== undefined ? data.java_version : server.java_version,
      id
    );
    return result.changes > 0;
  }

  static updateOwner(id: number, newUserId: number): boolean {
    const stmt = db.prepare('UPDATE servers SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const result = stmt.run(newUserId, id);
    return result.changes > 0;
  }

  static updateSuspended(id: number, suspended: number): boolean {
    const stmt = db.prepare('UPDATE servers SET suspended = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const result = stmt.run(suspended, id);
    return result.changes > 0;
  }

  static delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM servers WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

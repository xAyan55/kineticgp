"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerModel = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
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
    static generateNextPort() {
        const stmt = database_1.db.prepare('SELECT MAX(port) as maxPort FROM servers');
        const row = stmt.get();
        const basePort = (row && row.maxPort) ? row.maxPort + 1 : 25565;
        return basePort < 25565 ? 25565 : basePort;
    }
    static findByUuid(uuid) {
        const stmt = database_1.db.prepare(`
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.uuid = ?
    `);
        return stmt.get(uuid) || null;
    }
    static findById(id) {
        const stmt = database_1.db.prepare(`
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.id = ?
    `);
        return stmt.get(id) || null;
    }
    static findByUserId(userId) {
        const stmt = database_1.db.prepare(`
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.user_id = ? AND s.suspended = 0
      ORDER BY s.id ASC
    `);
        return stmt.all(userId);
    }
    static findAll(options) {
        let query = `
      SELECT s.*, u.username as owner_name, u.email as owner_email 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE 1=1
    `;
        const params = [];
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
        }
        else if (options?.sort === 'status') {
            query += ' ORDER BY s.status DESC';
        }
        else if (options?.sort === 'version') {
            query += ' ORDER BY s.version DESC';
        }
        else {
            query += ' ORDER BY s.id DESC';
        }
        if (options?.page && options?.limit) {
            const offset = (options.page - 1) * options.limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(options.limit, offset);
        }
        const stmt = database_1.db.prepare(query);
        return stmt.all(...params);
    }
    static countFiltered(options) {
        let query = `
      SELECT COUNT(*) as count 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE 1=1
    `;
        const params = [];
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
        const stmt = database_1.db.prepare(query);
        return stmt.get(...params).count;
    }
    static create(data) {
        const uuid = crypto_1.default.randomUUID();
        const port = this.generateNextPort();
        const directory = path_1.default.join(process.cwd(), 'storage', 'servers', uuid);
        const jar_file = 'server.jar';
        const version = data.version || '1.20.4';
        const software = data.software || 'Paper';
        const java_version = data.java_version || '21';
        const ram_limit = data.ram_limit || 2048;
        const cpu_limit = data.cpu_limit || 100;
        const disk_limit = data.disk_limit || 10;
        const startup_command = 'java -Xms128M -Xmx{ram}M -jar {jar_file} --nogui';
        const stmt = database_1.db.prepare(`
      INSERT INTO servers (uuid, user_id, name, description, game, version, software, java_version, ram_limit, cpu_limit, disk_limit, directory, jar_file, port, startup_command, auto_restart, status)
      VALUES (?, ?, ?, ?, 'Minecraft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'offline')
    `);
        const info = stmt.run(uuid, data.user_id, data.name, data.description || '', version, software, java_version, ram_limit, cpu_limit, disk_limit, directory, jar_file, port, startup_command);
        return this.findById(info.lastInsertRowid);
    }
    static updateRuntimeState(id, status, pid) {
        let query = 'UPDATE servers SET status = ?, pid = ?, updated_at = CURRENT_TIMESTAMP';
        if (status === 'online') {
            query += ', last_started = CURRENT_TIMESTAMP';
        }
        else if (status === 'offline') {
            query += ', last_stopped = CURRENT_TIMESTAMP, cpu_usage = 0, memory_usage = 0, players_online = 0';
        }
        query += ' WHERE id = ?';
        const stmt = database_1.db.prepare(query);
        const result = stmt.run(status, pid, id);
        return result.changes > 0;
    }
    static updateResources(id, cpu, memory, disk, players) {
        const stmt = database_1.db.prepare(`
      UPDATE servers 
      SET cpu_usage = ?, memory_usage = ?, disk_usage = ?, players_online = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
        const result = stmt.run(cpu, memory, disk, players, id);
        return result.changes > 0;
    }
    static updateSettings(id, data) {
        const server = this.findById(id);
        if (!server)
            return false;
        const stmt = database_1.db.prepare(`
      UPDATE servers 
      SET name = ?, description = ?, ram_limit = ?, version = ?, software = ?, startup_command = ?, auto_restart = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
        const result = stmt.run(data.name !== undefined ? data.name : server.name, data.description !== undefined ? data.description : server.description, data.ram_limit !== undefined ? data.ram_limit : server.ram_limit, data.version !== undefined ? data.version : server.version, data.software !== undefined ? data.software : server.software, data.startup_command !== undefined ? data.startup_command : server.startup_command, data.auto_restart !== undefined ? data.auto_restart : server.auto_restart, id);
        return result.changes > 0;
    }
    static updateOwner(id, newUserId) {
        const stmt = database_1.db.prepare('UPDATE servers SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const result = stmt.run(newUserId, id);
        return result.changes > 0;
    }
    static updateSuspended(id, suspended) {
        const stmt = database_1.db.prepare('UPDATE servers SET suspended = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const result = stmt.run(suspended, id);
        return result.changes > 0;
    }
    static delete(id) {
        const stmt = database_1.db.prepare('DELETE FROM servers WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
}
exports.ServerModel = ServerModel;

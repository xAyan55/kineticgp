"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteSessionStore = void 0;
const express_session_1 = __importDefault(require("express-session"));
const database_1 = require("../db/database");
class SQLiteSessionStore extends express_session_1.default.Store {
    constructor() {
        super();
        // Ensure sessions table exists
        database_1.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
    `);
    }
    get(sid, callback) {
        try {
            const now = Date.now();
            const row = database_1.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?').get(sid, now);
            if (!row) {
                return callback(null, null);
            }
            const sessData = JSON.parse(row.sess);
            callback(null, sessData);
        }
        catch (err) {
            callback(err);
        }
    }
    set(sid, sessData, callback) {
        try {
            const maxAge = sessData.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000;
            const expired = Date.now() + maxAge;
            const sessStr = JSON.stringify(sessData);
            database_1.db.prepare(`
        INSERT INTO sessions (sid, sess, expired)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
      `).run(sid, sessStr, expired);
            if (callback)
                callback(null);
        }
        catch (err) {
            if (callback)
                callback(err);
        }
    }
    destroy(sid, callback) {
        try {
            database_1.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
            if (callback)
                callback(null);
        }
        catch (err) {
            if (callback)
                callback(err);
        }
    }
    touch(sid, sessData, callback) {
        this.set(sid, sessData, callback);
    }
}
exports.SQLiteSessionStore = SQLiteSessionStore;

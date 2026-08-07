import session from 'express-session';
import { db } from '../db/database';

export class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
    // Ensure sessions table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
    `);
  }

  get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): void {
    try {
      const now = Date.now();
      const row = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?').get(sid, now) as { sess: string } | undefined;
      if (!row) {
        return callback(null, null);
      }
      const sessData = JSON.parse(row.sess);
      callback(null, sessData);
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, sessData: session.SessionData, callback?: (err?: any) => void): void {
    try {
      const maxAge = sessData.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;
      const sessStr = JSON.stringify(sessData);

      db.prepare(`
        INSERT INTO sessions (sid, sess, expired)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
      `).run(sid, sessStr, expired);

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  touch(sid: string, sessData: session.SessionData, callback?: (err?: any) => void): void {
    this.set(sid, sessData, callback);
  }
}

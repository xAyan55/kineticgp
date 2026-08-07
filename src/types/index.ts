export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  avatar: string;
  banner: string;
  role: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Server {
  id: number;
  name: string;
  game: string;
  status: 'online' | 'starting' | 'stopping' | 'offline';
  ip_address: string;
  port: number;
  players_online: number;
  max_players: number;
  cpu_usage: number; // percentage
  memory_usage: number; // MB
  max_memory: number; // MB
  disk_usage: number; // GB
  max_disk: number; // GB
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  username: string;
  action: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  updated_at: string;
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    avatar?: string;
    csrfSecret?: string;
  }
}

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  avatar: string;
  banner: string;
  role: 'superadmin' | 'admin' | 'user';
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
  last_login?: string | null;
  deleted_at?: string | null;
}

export interface Server {
  id: number;
  uuid: string;
  user_id: number;
  name: string;
  description: string;
  game: string;
  version: string;
  software: string;
  java_version: string;
  ram_limit: number; // MB
  cpu_limit: number; // %
  disk_limit: number; // GB
  directory: string;
  jar_file: string;
  port: number;
  startup_command: string;
  auto_restart: number; // 0 or 1
  status: 'online' | 'starting' | 'stopping' | 'offline';
  pid?: number | null;
  players_online: number;
  max_players: number;
  cpu_usage: number; // %
  memory_usage: number; // MB
  disk_usage: number; // GB
  suspended: number; // 0 or 1
  owner_name?: string;
  owner_email?: string;
  last_started?: string | null;
  last_stopped?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileItem {
  name: string;
  path: string;
  size: number;
  formattedSize: string;
  isDir: boolean;
  modified: string;
  permissions?: string;
  extension?: string;
}

export interface ServerLogEntry {
  id: number;
  server_id: number;
  message: string;
  created_at: string;
}

export interface ServerEventEntry {
  id: number;
  server_id: number;
  event: string;
  details: string;
  created_at: string;
}

export interface NodeInfo {
  id: number;
  name: string;
  hostname: string;
  ip_address: string;
  status: 'online' | 'offline' | 'degraded';
  cpu_usage: number;
  memory_usage: number;
  memory_total: number;
  disk_usage: number;
  disk_total: number;
  is_local: number;
  created_at: string;
  updated_at: string;
  os_type?: string;
  kernel?: string;
  arch?: string;
  cpu_model?: string;
  cpu_cores?: number;
  uptime?: string;
  java_version?: string;
  pm2_status?: string;
}

export interface Plan {
  id: number;
  name: string;
  description: string;
  memory_limit: number; // MB
  cpu_limit: number; // %
  disk_limit: number; // GB
  max_servers: number;
  max_backups: number;
  max_databases: number;
  max_allocations: number;
  price: number;
  is_enabled: number;
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
    role?: 'superadmin' | 'admin' | 'user';
    csrfSecret?: string;
  }
}

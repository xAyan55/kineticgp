import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Server, FileItem } from '../types';

export class FileManagerService {
  static getSanitizedPath(server: Server, subPath: string = ''): string {
    const rootDir = path.resolve(server.directory || path.join(process.cwd(), 'storage', 'servers', server.uuid));
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }
    const safeSubPath = path.normalize(subPath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.resolve(rootDir, safeSubPath);

    if (!fullPath.startsWith(rootDir)) {
      return rootDir; // Prevent path traversal outside server directory
    }
    return fullPath;
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static listFiles(server: Server, subPath: string = ''): { currentPath: string; parentPath: string | null; items: FileItem[] } {
    const rootDir = path.resolve(server.directory || path.join(process.cwd(), 'storage', 'servers', server.uuid));
    const targetDir = this.getSanitizedPath(server, subPath);

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return { currentPath: '/', parentPath: null, items: [] };
    }

    const relPath = path.relative(rootDir, targetDir).replace(/\\/g, '/');
    const currentPath = relPath ? `/${relPath}` : '/';
    const parentPath = currentPath !== '/' ? path.dirname(currentPath) : null;

    const filenames = fs.readdirSync(targetDir);
    const items: FileItem[] = [];

    for (const name of filenames) {
      try {
        const itemFullPath = path.join(targetDir, name);
        const stat = fs.statSync(itemFullPath);
        const isDir = stat.isDirectory();
        const ext = isDir ? '' : path.extname(name).toLowerCase();
        const itemRelPath = path.relative(rootDir, itemFullPath).replace(/\\/g, '/');

        items.push({
          name,
          path: `/${itemRelPath}`,
          size: isDir ? 0 : stat.size,
          formattedSize: isDir ? '--' : this.formatBytes(stat.size),
          isDir,
          modified: stat.mtime.toISOString().replace('T', ' ').substring(0, 16),
          extension: ext
        });
      } catch (e) {
        // Skip unreadable files
      }
    }

    // Sort: Folders first, then files alphabetically
    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    return { currentPath, parentPath, items };
  }

  static readFile(server: Server, subPath: string): string {
    const filePath = this.getSanitizedPath(server, subPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      throw new Error('File not found or is a directory');
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  static saveFile(server: Server, subPath: string, content: string): void {
    const filePath = this.getSanitizedPath(server, subPath);
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  static createFolder(server: Server, subPath: string, folderName: string): void {
    const targetDir = path.join(this.getSanitizedPath(server, subPath), folderName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  static createFile(server: Server, subPath: string, fileName: string): void {
    const targetFile = path.join(this.getSanitizedPath(server, subPath), fileName);
    if (!fs.existsSync(targetFile)) {
      fs.writeFileSync(targetFile, '', 'utf-8');
    }
  }

  static renameItem(server: Server, oldSubPath: string, newName: string): void {
    const oldPath = this.getSanitizedPath(server, oldSubPath);
    const newPath = path.join(path.dirname(oldPath), newName);
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }
  }

  static deleteItem(server: Server, subPath: string): void {
    const targetPath = this.getSanitizedPath(server, subPath);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

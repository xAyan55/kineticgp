import fs from 'fs';
import path from 'path';
import { Server, FileItem } from '../types';

export class FileManagerService {
  /**
   * Maximum allowed file size for in-browser text editing (2 MB).
   */
  static MAX_EDIT_SIZE = 2 * 1024 * 1024;

  /**
   * Resolves a subPath against the server's root directory, enforcing canonical
   * realpath checks to prevent path traversal outside the assigned root.
   */
  static getSanitizedPath(server: Server, subPath: string = ''): string {
    const rawRootDir = path.resolve(server.directory || path.join(process.cwd(), 'storage', 'servers', server.uuid));
    if (!fs.existsSync(rawRootDir)) {
      fs.mkdirSync(rawRootDir, { recursive: true });
    }
    const rootDir = fs.realpathSync(rawRootDir);

    // Remove null bytes & normalize subPath
    const sanitizedSub = String(subPath || '').replace(/\0/g, '').trim();
    const resolvedPath = path.resolve(rootDir, '.' + path.sep + sanitizedSub);

    // Check directory traversal
    if (resolvedPath !== rootDir && !resolvedPath.startsWith(rootDir + path.sep)) {
      const err = new Error('Access denied: Path traversal outside server directory');
      (err as any).statusCode = 403;
      throw err;
    }

    // Check canonical realpath for symlink escapes if target exists
    if (fs.existsSync(resolvedPath)) {
      const realResolved = fs.realpathSync(resolvedPath);
      if (realResolved !== rootDir && !realResolved.startsWith(rootDir + path.sep)) {
        const err = new Error('Access denied: Symlink points outside server directory');
        (err as any).statusCode = 403;
        throw err;
      }
      return realResolved;
    }

    return resolvedPath;
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static isEditableTextFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    const allowedExts = [
      '.properties', '.yml', '.yaml', '.json', '.toml', '.ini', '.cfg',
      '.conf', '.txt', '.log', '.sh', '.bash', '.xml', '.js', '.ts',
      '.css', '.html', '.md', '.env', '.json5'
    ];
    const exactNames = [
      'server.properties', 'bukkit.yml', 'spigot.yml', 'paper-global.yml',
      'paper-world-defaults.yml', 'ops.json', 'whitelist.json', 'permissions.yml',
      'eula.txt', 'bungee.yml', 'velocity.toml'
    ];
    const basename = path.basename(fileName).toLowerCase();
    return allowedExts.includes(ext) || exactNames.includes(basename);
  }

  static detectLanguageMode(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const basename = path.basename(fileName).toLowerCase();

    if (ext === '.json' || basename.endsWith('.json')) return 'javascript';
    if (ext === '.yml' || ext === '.yaml') return 'yaml';
    if (ext === '.properties' || ext === '.cfg' || ext === '.conf' || ext === '.ini') return 'properties';
    if (ext === '.toml') return 'toml';
    if (ext === '.sh' || ext === '.bash') return 'shell';
    if (ext === '.xml' || ext === '.html') return 'xml';
    if (ext === '.css') return 'css';
    if (ext === '.md') return 'markdown';
    return 'text/plain';
  }

  static listFiles(server: Server, subPath: string = ''): { currentPath: string; parentPath: string | null; items: FileItem[] } {
    const rawRootDir = path.resolve(server.directory || path.join(process.cwd(), 'storage', 'servers', server.uuid));
    if (!fs.existsSync(rawRootDir)) {
      fs.mkdirSync(rawRootDir, { recursive: true });
    }
    const rootDir = fs.realpathSync(rawRootDir);
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
        // Skip unreadable items
      }
    }

    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    return { currentPath, parentPath, items };
  }

  /**
   * Detailed read for editor with binary protection, size limit, and mtime tracking.
   */
  static readFileDetailed(server: Server, subPath: string): {
    content: string;
    mtimeMs: number;
    size: number;
    isText: boolean;
    isTooLarge: boolean;
    mode: string;
    filename: string;
    filePath: string;
  } {
    const filePath = this.getSanitizedPath(server, subPath);
    const filename = path.basename(filePath);

    if (!fs.existsSync(filePath)) {
      const err = new Error(`File not found: "${subPath}"`);
      (err as any).statusCode = 404;
      throw err;
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const err = new Error(`Requested path "${subPath}" is a directory`);
      (err as any).statusCode = 400;
      throw err;
    }

    const isText = this.isEditableTextFile(filename);
    const isTooLarge = stat.size > this.MAX_EDIT_SIZE;
    const mode = this.detectLanguageMode(filename);

    if (!isText || isTooLarge) {
      return {
        content: '',
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        isText,
        isTooLarge,
        mode,
        filename,
        filePath: subPath
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      content,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      isText: true,
      isTooLarge: false,
      mode,
      filename,
      filePath: subPath
    };
  }

  static readFile(server: Server, subPath: string): string {
    const detail = this.readFileDetailed(server, subPath);
    if (!detail.isText) {
      throw new Error('This file cannot be edited in the text editor.');
    }
    if (detail.isTooLarge) {
      throw new Error('This file is too large to edit in the browser.');
    }
    return detail.content;
  }

  /**
   * Atomic save with JSON syntax validation, concurrent modification check, and temp-file rename.
   */
  static saveFileAtomic(server: Server, subPath: string, content: string, expectedMtimeMs?: number): { mtimeMs: number; size: number } {
    const filePath = this.getSanitizedPath(server, subPath);
    const filename = path.basename(filePath);

    // 1. JSON syntax check
    if (filename.toLowerCase().endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (err: any) {
        const syntaxErr = new Error(`Invalid JSON syntax: ${err.message}`);
        (syntaxErr as any).statusCode = 422;
        throw syntaxErr;
      }
    }

    // 2. Conflict detection if expectedMtimeMs provided
    if (fs.existsSync(filePath)) {
      const currentStat = fs.statSync(filePath);
      if (currentStat.isDirectory()) {
        const err = new Error('Target path is a directory');
        (err as any).statusCode = 400;
        throw err;
      }
      if (expectedMtimeMs && Math.abs(currentStat.mtimeMs - expectedMtimeMs) > 1000) {
        const conflictErr = new Error('This file was modified externally.');
        (conflictErr as any).statusCode = 409;
        (conflictErr as any).currentMtimeMs = currentStat.mtimeMs;
        throw conflictErr;
      }
    }

    // 3. Ensure parent directory exists
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // 4. Atomic write via temp file in the SAME directory
    const tmpPath = path.join(parentDir, `.${filename}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`);

    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, filePath);
    } catch (writeErr: any) {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
      }
      const err = new Error(`Filesystem write failed: ${writeErr.message}`);
      (err as any).statusCode = 500;
      throw err;
    }

    const newStat = fs.statSync(filePath);
    return {
      mtimeMs: newStat.mtimeMs,
      size: newStat.size
    };
  }

  static saveFile(server: Server, subPath: string, content: string): void {
    this.saveFileAtomic(server, subPath, content);
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

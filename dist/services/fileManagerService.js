"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileManagerService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class FileManagerService {
    /**
     * Maximum allowed file size for in-browser text editing (2 MB).
     */
    static MAX_EDIT_SIZE = 2 * 1024 * 1024;
    /**
     * Resolves a subPath against the server's root directory, enforcing canonical
     * realpath checks to prevent path traversal outside the assigned root.
     */
    static getSanitizedPath(server, subPath = '') {
        const rawRootDir = path_1.default.resolve(server.directory || path_1.default.join(process.cwd(), 'storage', 'servers', server.uuid));
        if (!fs_1.default.existsSync(rawRootDir)) {
            fs_1.default.mkdirSync(rawRootDir, { recursive: true });
        }
        const rootDir = fs_1.default.realpathSync(rawRootDir);
        // Remove null bytes & normalize subPath
        const sanitizedSub = String(subPath || '').replace(/\0/g, '').trim();
        const resolvedPath = path_1.default.resolve(rootDir, '.' + path_1.default.sep + sanitizedSub);
        // Check directory traversal
        if (resolvedPath !== rootDir && !resolvedPath.startsWith(rootDir + path_1.default.sep)) {
            const err = new Error('Access denied: Path traversal outside server directory');
            err.statusCode = 403;
            throw err;
        }
        // Check canonical realpath for symlink escapes if target exists
        if (fs_1.default.existsSync(resolvedPath)) {
            const realResolved = fs_1.default.realpathSync(resolvedPath);
            if (realResolved !== rootDir && !realResolved.startsWith(rootDir + path_1.default.sep)) {
                const err = new Error('Access denied: Symlink points outside server directory');
                err.statusCode = 403;
                throw err;
            }
            return realResolved;
        }
        return resolvedPath;
    }
    static formatBytes(bytes) {
        if (bytes === 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    static isEditableTextFile(fileName) {
        const ext = path_1.default.extname(fileName).toLowerCase();
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
        const basename = path_1.default.basename(fileName).toLowerCase();
        return allowedExts.includes(ext) || exactNames.includes(basename);
    }
    static detectLanguageMode(fileName) {
        const ext = path_1.default.extname(fileName).toLowerCase();
        const basename = path_1.default.basename(fileName).toLowerCase();
        if (ext === '.json' || basename.endsWith('.json'))
            return 'javascript';
        if (ext === '.yml' || ext === '.yaml')
            return 'yaml';
        if (ext === '.properties' || ext === '.cfg' || ext === '.conf' || ext === '.ini')
            return 'properties';
        if (ext === '.toml')
            return 'toml';
        if (ext === '.sh' || ext === '.bash')
            return 'shell';
        if (ext === '.xml' || ext === '.html')
            return 'xml';
        if (ext === '.css')
            return 'css';
        if (ext === '.md')
            return 'markdown';
        return 'text/plain';
    }
    static listFiles(server, subPath = '') {
        const rawRootDir = path_1.default.resolve(server.directory || path_1.default.join(process.cwd(), 'storage', 'servers', server.uuid));
        if (!fs_1.default.existsSync(rawRootDir)) {
            fs_1.default.mkdirSync(rawRootDir, { recursive: true });
        }
        const rootDir = fs_1.default.realpathSync(rawRootDir);
        const targetDir = this.getSanitizedPath(server, subPath);
        if (!fs_1.default.existsSync(targetDir) || !fs_1.default.statSync(targetDir).isDirectory()) {
            return { currentPath: '/', parentPath: null, items: [] };
        }
        const relPath = path_1.default.relative(rootDir, targetDir).replace(/\\/g, '/');
        const currentPath = relPath ? `/${relPath}` : '/';
        const parentPath = currentPath !== '/' ? path_1.default.dirname(currentPath) : null;
        const filenames = fs_1.default.readdirSync(targetDir);
        const items = [];
        for (const name of filenames) {
            try {
                const itemFullPath = path_1.default.join(targetDir, name);
                const stat = fs_1.default.statSync(itemFullPath);
                const isDir = stat.isDirectory();
                const ext = isDir ? '' : path_1.default.extname(name).toLowerCase();
                const itemRelPath = path_1.default.relative(rootDir, itemFullPath).replace(/\\/g, '/');
                items.push({
                    name,
                    path: `/${itemRelPath}`,
                    size: isDir ? 0 : stat.size,
                    formattedSize: isDir ? '--' : this.formatBytes(stat.size),
                    isDir,
                    modified: stat.mtime.toISOString().replace('T', ' ').substring(0, 16),
                    extension: ext
                });
            }
            catch (e) {
                // Skip unreadable items
            }
        }
        items.sort((a, b) => {
            if (a.isDir && !b.isDir)
                return -1;
            if (!a.isDir && b.isDir)
                return 1;
            return a.name.localeCompare(b.name);
        });
        return { currentPath, parentPath, items };
    }
    /**
     * Detailed read for editor with binary protection, size limit, and mtime tracking.
     */
    static readFileDetailed(server, subPath) {
        const filePath = this.getSanitizedPath(server, subPath);
        const filename = path_1.default.basename(filePath);
        if (!fs_1.default.existsSync(filePath)) {
            const err = new Error(`File not found: "${subPath}"`);
            err.statusCode = 404;
            throw err;
        }
        const stat = fs_1.default.statSync(filePath);
        if (stat.isDirectory()) {
            const err = new Error(`Requested path "${subPath}" is a directory`);
            err.statusCode = 400;
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
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
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
    static readFile(server, subPath) {
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
    static saveFileAtomic(server, subPath, content, expectedMtimeMs) {
        const filePath = this.getSanitizedPath(server, subPath);
        const filename = path_1.default.basename(filePath);
        // 1. JSON syntax check
        if (filename.toLowerCase().endsWith('.json')) {
            try {
                JSON.parse(content);
            }
            catch (err) {
                const syntaxErr = new Error(`Invalid JSON syntax: ${err.message}`);
                syntaxErr.statusCode = 422;
                throw syntaxErr;
            }
        }
        // 2. Conflict detection if expectedMtimeMs provided
        if (fs_1.default.existsSync(filePath)) {
            const currentStat = fs_1.default.statSync(filePath);
            if (currentStat.isDirectory()) {
                const err = new Error('Target path is a directory');
                err.statusCode = 400;
                throw err;
            }
            if (expectedMtimeMs && Math.abs(currentStat.mtimeMs - expectedMtimeMs) > 1000) {
                const conflictErr = new Error('This file was modified externally.');
                conflictErr.statusCode = 409;
                conflictErr.currentMtimeMs = currentStat.mtimeMs;
                throw conflictErr;
            }
        }
        // 3. Ensure parent directory exists
        const parentDir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(parentDir)) {
            fs_1.default.mkdirSync(parentDir, { recursive: true });
        }
        // 4. Atomic write via temp file in the SAME directory
        const tmpPath = path_1.default.join(parentDir, `.${filename}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`);
        try {
            fs_1.default.writeFileSync(tmpPath, content, 'utf-8');
            fs_1.default.renameSync(tmpPath, filePath);
        }
        catch (writeErr) {
            if (fs_1.default.existsSync(tmpPath)) {
                try {
                    fs_1.default.unlinkSync(tmpPath);
                }
                catch (e) { }
            }
            const err = new Error(`Filesystem write failed: ${writeErr.message}`);
            err.statusCode = 500;
            throw err;
        }
        const newStat = fs_1.default.statSync(filePath);
        return {
            mtimeMs: newStat.mtimeMs,
            size: newStat.size
        };
    }
    static saveFile(server, subPath, content) {
        this.saveFileAtomic(server, subPath, content);
    }
    static createFolder(server, subPath, folderName) {
        const targetDir = path_1.default.join(this.getSanitizedPath(server, subPath), folderName);
        if (!fs_1.default.existsSync(targetDir)) {
            fs_1.default.mkdirSync(targetDir, { recursive: true });
        }
    }
    static createFile(server, subPath, fileName) {
        const targetFile = path_1.default.join(this.getSanitizedPath(server, subPath), fileName);
        if (!fs_1.default.existsSync(targetFile)) {
            fs_1.default.writeFileSync(targetFile, '', 'utf-8');
        }
    }
    static renameItem(server, oldSubPath, newName) {
        const oldPath = this.getSanitizedPath(server, oldSubPath);
        const newPath = path_1.default.join(path_1.default.dirname(oldPath), newName);
        if (fs_1.default.existsSync(oldPath)) {
            fs_1.default.renameSync(oldPath, newPath);
        }
    }
    static deleteItem(server, subPath) {
        const targetPath = this.getSanitizedPath(server, subPath);
        if (fs_1.default.existsSync(targetPath)) {
            fs_1.default.rmSync(targetPath, { recursive: true, force: true });
        }
    }
}
exports.FileManagerService = FileManagerService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileManagerService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class FileManagerService {
    static getSanitizedPath(server, subPath = '') {
        const rootDir = path_1.default.resolve(server.directory || path_1.default.join(process.cwd(), 'storage', 'servers', server.uuid));
        if (!fs_1.default.existsSync(rootDir)) {
            fs_1.default.mkdirSync(rootDir, { recursive: true });
        }
        const safeSubPath = path_1.default.normalize(subPath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path_1.default.resolve(rootDir, safeSubPath);
        if (!fullPath.startsWith(rootDir)) {
            return rootDir; // Prevent path traversal outside server directory
        }
        return fullPath;
    }
    static formatBytes(bytes) {
        if (bytes === 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    static listFiles(server, subPath = '') {
        const rootDir = path_1.default.resolve(server.directory || path_1.default.join(process.cwd(), 'storage', 'servers', server.uuid));
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
                // Skip unreadable files
            }
        }
        // Sort: Folders first, then files alphabetically
        items.sort((a, b) => {
            if (a.isDir && !b.isDir)
                return -1;
            if (!a.isDir && b.isDir)
                return 1;
            return a.name.localeCompare(b.name);
        });
        return { currentPath, parentPath, items };
    }
    static readFile(server, subPath) {
        const filePath = this.getSanitizedPath(server, subPath);
        if (!fs_1.default.existsSync(filePath) || fs_1.default.statSync(filePath).isDirectory()) {
            throw new Error('File not found or is a directory');
        }
        return fs_1.default.readFileSync(filePath, 'utf-8');
    }
    static saveFile(server, subPath, content) {
        const filePath = this.getSanitizedPath(server, subPath);
        const parentDir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(parentDir)) {
            fs_1.default.mkdirSync(parentDir, { recursive: true });
        }
        fs_1.default.writeFileSync(filePath, content, 'utf-8');
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

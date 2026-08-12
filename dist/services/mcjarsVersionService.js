"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McJarsVersionService = void 0;
const minecraftJarService_1 = require("./minecraftJarService");
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
class McJarsVersionService {
    static cache = new Map();
    /**
     * All software types supported by the panel, mapped to MCJars API types.
     * The `key` is what gets stored in the database / sent in forms.
     */
    static SOFTWARE_TYPES = [
        // Server software (plugins)
        { key: 'Paper', apiType: 'PAPER', name: 'Paper', description: 'High Performance & Plugins', category: 'server', deprecated: false },
        { key: 'Purpur', apiType: 'PURPUR', name: 'Purpur', description: 'Optimized Paper Fork', category: 'server', deprecated: false },
        { key: 'Spigot', apiType: 'SPIGOT', name: 'Spigot', description: 'Classic Bukkit Fork', category: 'server', deprecated: false },
        { key: 'Folia', apiType: 'FOLIA', name: 'Folia', description: 'Multithreaded Paper Fork', category: 'server', deprecated: false },
        { key: 'Vanilla', apiType: 'VANILLA', name: 'Vanilla', description: 'Official Mojang Server', category: 'server', deprecated: false },
        { key: 'Pufferfish', apiType: 'PUFFERFISH', name: 'Pufferfish', description: 'Performance Paper Fork', category: 'server', deprecated: false },
        { key: 'Leaves', apiType: 'LEAVES', name: 'Leaves', description: 'Vanilla-Faithful Paper Fork', category: 'server', deprecated: false },
        { key: 'Canvas', apiType: 'CANVAS', name: 'Canvas', description: 'Performance Folia Fork', category: 'server', deprecated: false },
        // Modded software
        { key: 'Fabric', apiType: 'FABRIC', name: 'Fabric', description: 'Lightweight Mod Loader', category: 'modded', deprecated: false },
        { key: 'Forge', apiType: 'FORGE', name: 'Forge', description: 'Classic Mod Platform', category: 'modded', deprecated: false },
        { key: 'NeoForge', apiType: 'NEOFORGE', name: 'NeoForge', description: 'Modern Forge Successor', category: 'modded', deprecated: false },
        { key: 'Quilt', apiType: 'QUILT', name: 'Quilt', description: 'Community Mod Toolchain', category: 'modded', deprecated: false },
        { key: 'Mohist', apiType: 'MOHIST', name: 'Mohist', description: 'Forge + Spigot Plugins', category: 'modded', deprecated: false },
        { key: 'Arclight', apiType: 'ARCLIGHT', name: 'Arclight', description: 'Bukkit + Mixin Modding', category: 'modded', deprecated: false },
        { key: 'Sponge', apiType: 'SPONGE', name: 'Sponge', description: 'Modding Platform', category: 'modded', deprecated: false },
        // Proxy software
        { key: 'Velocity', apiType: 'VELOCITY', name: 'Velocity', description: 'Modern High-Performance Proxy', category: 'proxy', deprecated: false },
        { key: 'BungeeCord', apiType: 'BUNGEECORD', name: 'BungeeCord', description: 'Classic Proxy Server', category: 'proxy', deprecated: false },
        { key: 'Waterfall', apiType: 'WATERFALL', name: 'Waterfall', description: 'BungeeCord Fork (Deprecated)', category: 'proxy', deprecated: true },
    ];
    /**
     * Maps a panel software key (e.g. 'Paper') to the MCJars API type (e.g. 'PAPER').
     */
    static getApiType(softwareKey) {
        const entry = this.SOFTWARE_TYPES.find(s => s.key.toLowerCase() === softwareKey.toLowerCase());
        return entry?.apiType || null;
    }
    /**
     * Fetches version list for a given software type from MCJars API.
     * Returns cached result if available and not expired.
     * Only returns RELEASE versions by default.
     */
    static async getVersions(softwareKey, includeSnapshots = false) {
        const apiType = this.getApiType(softwareKey);
        if (!apiType)
            return [];
        const cacheKey = apiType;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
            return includeSnapshots
                ? cached.versions
                : cached.versions.filter(v => v.type === 'RELEASE');
        }
        try {
            const url = `https://mcjars.app/api/v2/builds/${apiType}`;
            const data = await minecraftJarService_1.MinecraftJarService.fetchJson(url);
            if (!data?.success || !data.builds)
                return [];
            const versions = Object.entries(data.builds).map(([id, info]) => ({
                id,
                type: info.type,
                supported: info.supported,
                java: info.java,
                builds: info.builds,
            }));
            // Sort by Minecraft semver, newest first
            versions.sort((a, b) => this.compareMinecraftVersions(b.id, a.id));
            this.cache.set(cacheKey, { versions, fetchedAt: Date.now() });
            return includeSnapshots
                ? versions
                : versions.filter(v => v.type === 'RELEASE');
        }
        catch (e) {
            console.error(`[McJarsVersionService] Failed to fetch versions for ${apiType}:`, e.message);
            // Return stale cache if available
            if (cached) {
                return includeSnapshots
                    ? cached.versions
                    : cached.versions.filter(v => v.type === 'RELEASE');
            }
            return [];
        }
    }
    /**
     * Compares two Minecraft version strings for sorting.
     * Handles versions like 1.21.10, 1.21.9, 1.8.8, etc.
     * Returns negative if a < b, positive if a > b, 0 if equal.
     */
    static compareMinecraftVersions(a, b) {
        // Strip snapshot suffixes for comparison (e.g. "1.21.9-pre2" -> "1.21.9")
        const cleanA = a.replace(/-(pre|rc|snapshot)\d*/gi, '');
        const cleanB = b.replace(/-(pre|rc|snapshot)\d*/gi, '');
        const partsA = cleanA.split('.').map(Number);
        const partsB = cleanB.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA !== numB)
                return numA - numB;
        }
        // If base versions are equal, snapshots come after releases
        const isSnapshotA = a.includes('-');
        const isSnapshotB = b.includes('-');
        if (isSnapshotA && !isSnapshotB)
            return 1;
        if (!isSnapshotA && isSnapshotB)
            return -1;
        return 0;
    }
}
exports.McJarsVersionService = McJarsVersionService;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModrinthService = void 0;
class ModrinthService {
    static BASE_URL = 'https://api.modrinth.com/v2';
    static USER_AGENT = 'xAyan55/KineticGP/1.0.0 (contact@kineticgp.dev)';
    static CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
    static cache = new Map();
    static getCache(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }
    static setCache(key, data) {
        this.cache.set(key, { timestamp: Date.now(), data });
    }
    static async request(endpoint) {
        const url = `${this.BASE_URL}${endpoint}`;
        const cacheKey = url;
        const cached = this.getCache(cacheKey);
        if (cached)
            return cached;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.USER_AGENT,
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.status === 429) {
                const err = new Error('Modrinth API rate limit reached. Please try again in a few moments.');
                err.statusCode = 429;
                err.code = 'RATE_LIMITED';
                throw err;
            }
            if (!response.ok) {
                const err = new Error(`Modrinth API request failed with status ${response.status}`);
                err.statusCode = response.status;
                err.code = 'MODRINTH_ERROR';
                throw err;
            }
            const data = (await response.json());
            this.setCache(cacheKey, data);
            return data;
        }
        catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                const err = new Error('Modrinth API request timed out (10s limit).');
                err.statusCode = 504;
                err.code = 'MODRINTH_TIMEOUT';
                throw err;
            }
            throw e;
        }
    }
    /**
     * Search for Bukkit/Paper/Spigot plugins on Modrinth.
     */
    static async searchPlugins(query = '', options) {
        const limit = options?.limit || 12;
        const offset = options?.offset || 0;
        const index = options?.index || 'downloads';
        // Facets targeting Bukkit/Paper/Spigot plugins
        const facets = JSON.stringify([
            ['categories:bukkit', 'categories:paper', 'categories:spigot', 'categories:purpur']
        ]);
        const params = new URLSearchParams({
            query: query.trim(),
            facets,
            index,
            offset: String(offset),
            limit: String(limit)
        });
        return this.request(`/search?${params.toString()}`);
    }
    /**
     * Get full details of a Modrinth project by ID or slug.
     */
    static async getProject(idOrSlug) {
        if (!idOrSlug)
            return null;
        try {
            return await this.request(`/project/${encodeURIComponent(idOrSlug)}`);
        }
        catch (e) {
            if (e.statusCode === 404)
                return null;
            throw e;
        }
    }
    /**
     * Get versions for a Modrinth project, optionally filtering by target Minecraft version.
     */
    static async getVersions(idOrSlug, gameVersion) {
        if (!idOrSlug)
            return [];
        try {
            let endpoint = `/project/${encodeURIComponent(idOrSlug)}/version`;
            const params = new URLSearchParams();
            if (gameVersion) {
                params.append('game_versions', JSON.stringify([gameVersion]));
            }
            params.append('loaders', JSON.stringify(['paper', 'spigot', 'bukkit', 'purpur', 'folia']));
            const queryString = params.toString();
            if (queryString) {
                endpoint += `?${queryString}`;
            }
            return await this.request(endpoint);
        }
        catch (e) {
            if (e.statusCode === 404)
                return [];
            throw e;
        }
    }
}
exports.ModrinthService = ModrinthService;

export interface ModrinthSearchHit {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
  date_created: string;
  date_modified: string;
  latest_version: string;
  license: string;
  client_side: string;
  server_side: string;
  gallery: string[];
}

export interface ModrinthProject {
  id: string;
  slug: string;
  project_type: string;
  team: string;
  title: string;
  description: string;
  body: string;
  body_url: string | null;
  published: string;
  updated: string;
  status: string;
  requested_status?: string;
  moderator_message?: string;
  license: { id: string; name: string; url: string | null };
  client_side: string;
  server_side: string;
  downloads: number;
  followers: number;
  categories: string[];
  additional_categories: string[];
  game_versions: string[];
  loaders: string[];
  icon_url: string | null;
  issues_url: string | null;
  source_url: string | null;
  wiki_url: string | null;
  discord_url: string | null;
  donation_urls: { id: string; platform: string; url: string }[];
}

export interface ModrinthFile {
  hashes: { sha512?: string; sha1?: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  file_type?: string | null;
}

export interface ModrinthDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  author_id: string;
  featured: boolean;
  name: string;
  version_number: string;
  changelog: string | null;
  changelog_url: string | null;
  date_published: string;
  downloads: number;
  version_type: 'release' | 'beta' | 'alpha';
  files: ModrinthFile[];
  dependencies: ModrinthDependency[];
  game_versions: string[];
  loaders: string[];
}

export class ModrinthService {
  private static BASE_URL = 'https://api.modrinth.com/v2';
  private static USER_AGENT = 'xAyan55/KineticGP/1.0.0 (contact@kineticgp.dev)';
  private static CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
  private static cache = new Map<string, { timestamp: number; data: any }>();

  private static getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private static setCache<T>(key: string, data: T): void {
    this.cache.set(key, { timestamp: Date.now(), data });
  }

  private static async request<T>(endpoint: string): Promise<T> {
    const url = `${this.BASE_URL}${endpoint}`;
    const cacheKey = url;
    const cached = this.getCache<T>(cacheKey);
    if (cached) return cached;

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
        (err as any).statusCode = 429;
        (err as any).code = 'RATE_LIMITED';
        throw err;
      }

      if (!response.ok) {
        const err = new Error(`Modrinth API request failed with status ${response.status}`);
        (err as any).statusCode = response.status;
        (err as any).code = 'MODRINTH_ERROR';
        throw err;
      }

      const data = (await response.json()) as T;
      this.setCache<T>(cacheKey, data);
      return data;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        const err = new Error('Modrinth API request timed out (10s limit).');
        (err as any).statusCode = 504;
        (err as any).code = 'MODRINTH_TIMEOUT';
        throw err;
      }
      throw e;
    }
  }

  /**
   * Search for Bukkit/Paper/Spigot plugins on Modrinth.
   */
  static async searchPlugins(query: string = '', options?: { offset?: number; limit?: number; index?: string }): Promise<{ hits: ModrinthSearchHit[]; total_hits: number }> {
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

    return this.request<{ hits: ModrinthSearchHit[]; total_hits: number }>(`/search?${params.toString()}`);
  }

  /**
   * Get full details of a Modrinth project by ID or slug.
   */
  static async getProject(idOrSlug: string): Promise<ModrinthProject | null> {
    if (!idOrSlug) return null;
    try {
      return await this.request<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`);
    } catch (e: any) {
      if (e.statusCode === 404) return null;
      throw e;
    }
  }

  /**
   * Get versions for a Modrinth project, optionally filtering by target Minecraft version.
   */
  static async getVersions(idOrSlug: string, gameVersion?: string): Promise<ModrinthVersion[]> {
    if (!idOrSlug) return [];
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

      return await this.request<ModrinthVersion[]>(endpoint);
    } catch (e: any) {
      if (e.statusCode === 404) return [];
      throw e;
    }
  }
}

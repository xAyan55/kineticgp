import { Server } from '../types';
import { ModrinthProject, ModrinthSearchHit, ModrinthVersion, ModrinthFile } from './modrinthService';

export class PluginCompatibilityService {
  static SUPPORTED_SERVER_SOFTWARE = ['paper', 'purpur', 'spigot', 'bukkit'];
  static SUPPORTED_LOADERS = ['bukkit', 'paper', 'spigot', 'purpur', 'folia'];
  static REJECTED_LOADERS = ['fabric', 'forge', 'neoforge', 'quilt'];

  /**
   * Verifies if the server software is a Bukkit-family server (Paper, Purpur, Spigot, Bukkit).
   * Backend enforcement - NEVER trust frontend requests.
   */
  static isSupportedServerSoftware(server: Server | null | undefined): boolean {
    if (!server || !server.software) return false;
    const softwareLower = server.software.toLowerCase().trim();
    return this.SUPPORTED_SERVER_SOFTWARE.some(s => softwareLower.includes(s));
  }

  /**
   * Stage 2 Validation: Validates if a Modrinth project is actually a Bukkit/Paper server plugin.
   * Rejects client-only projects, fabric-only, forge-only, datapacks, resource packs, etc.
   */
  static isPluginProject(project: ModrinthProject | ModrinthSearchHit): boolean {
    if (!project) return false;

    // Check server_side requirement
    if ('server_side' in project && project.server_side === 'unsupported') {
      return false;
    }
    if ('client_side' in project && project.client_side === 'required') {
      return false;
    }

    const categories = (project.categories || []).map(c => c.toLowerCase());
    const loaders = ('loaders' in project && project.loaders ? project.loaders : []).map(l => l.toLowerCase());

    // Check loader compatibility
    const hasBukkitLoader = loaders.some(l => this.SUPPORTED_LOADERS.includes(l));
    const hasRejectedLoaderOnly = loaders.length > 0 && loaders.every(l => this.REJECTED_LOADERS.includes(l));

    if (hasRejectedLoaderOnly) return false;

    // Check categories for Bukkit family
    const hasBukkitCategory = categories.some(c => this.SUPPORTED_LOADERS.includes(c));

    return hasBukkitLoader || hasBukkitCategory;
  }

  /**
   * Stage 3 Validation: Validates if a specific Modrinth version is compatible with target server.
   */
  static isPluginVersion(version: ModrinthVersion, server: Server): boolean {
    if (!version || !version.files || version.files.length === 0) return false;

    const loaders = (version.loaders || []).map(l => l.toLowerCase());
    const gameVersions = version.game_versions || [];

    // Must support at least one Bukkit loader if loaders specified
    if (loaders.length > 0) {
      const isBukkitCompatible = loaders.some(l => this.SUPPORTED_LOADERS.includes(l));
      if (!isBukkitCompatible) return false;
    }

    // Check Minecraft version compatibility if server version available
    if (server.version && gameVersions.length > 0) {
      const serverVer = server.version.trim();
      const serverVerMajor = serverVer.split('.').slice(0, 2).join('.'); // e.g. "1.21" from "1.21.1"

      const isExactMatch = gameVersions.includes(serverVer);
      const isMajorMatch = gameVersions.some(v => v.startsWith(serverVerMajor));

      if (!isExactMatch && !isMajorMatch) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filter and sort versions: Release > Beta > Alpha, newest date first.
   */
  static filterCompatibleVersions(versions: ModrinthVersion[], server: Server): ModrinthVersion[] {
    const valid = versions.filter(v => this.isPluginVersion(v, server));

    // Sort: Releases first, then newest date
    return valid.sort((a, b) => {
      if (a.version_type === 'release' && b.version_type !== 'release') return -1;
      if (a.version_type !== 'release' && b.version_type === 'release') return 1;
      return new Date(b.date_published).getTime() - new Date(a.date_published).getTime();
    });
  }

  /**
   * Stage 4 Validation: Selects and validates primary JAR file from version assets.
   */
  static selectPrimaryFile(version: ModrinthVersion): ModrinthFile | null {
    if (!version || !version.files || version.files.length === 0) return null;

    // 1. Look for file marked primary: true with .jar extension
    let primary = version.files.find(f => f.primary && f.filename.toLowerCase().endsWith('.jar'));

    // 2. Fallback to any file with .jar extension
    if (!primary) {
      primary = version.files.find(f => f.filename.toLowerCase().endsWith('.jar'));
    }

    if (!primary) return null;

    // Validate HTTPS scheme
    if (!primary.url || !primary.url.toLowerCase().startsWith('https://')) {
      return null;
    }

    return primary;
  }
}

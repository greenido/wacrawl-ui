import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getResolvedPaths } from '../runtimePaths.js';

/** Effective media directory (env + dashboard overrides + optional request headers). */
export function getArchiveMediaRoot(): string {
  return getResolvedPaths().mediaRoot;
}

/**
 * Turn a stored media_path from the SQLite archive into an absolute filesystem path
 * suitable for sendFile / fs access. Supports file:// URLs, platform-native separators,
 * and paths relative to WACRAWL_MEDIA_ROOT or the WaCrawl DB directory.
 */
export function resolveArchiveMediaPath(storedPath: string): string {
  let p = storedPath.trim();
  if (!p) {
    throw new Error('Empty media path.');
  }

  if (p.startsWith('file:')) {
    p = fileURLToPath(p);
  }

  p = path.normalize(p);
  if (path.isAbsolute(p)) {
    return p;
  }

  return path.resolve(getArchiveMediaRoot(), p);
}

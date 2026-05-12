import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getResolvedPaths } from '../runtimePaths.js';

/** Effective media directory (env + dashboard overrides + optional request headers). */
export function getArchiveMediaRoot(): string {
  return getResolvedPaths().mediaRoot;
}

/**
 * WhatsApp Desktop on macOS stores media under
 *   ~/Library/Group Containers/…/Message/Media/<jid>/…
 * but some DB rows store the path with just …/Media/<jid>/… (missing the
 * "Message/" segment). When the stored absolute path doesn't exist, we try
 * inserting "Message/" before the last "Media/" segment as a fallback.
 */
function tryWhatsAppMessageMediaFallback(abspath: string): string | null {
  const idx = abspath.lastIndexOf('/Media/');
  if (idx === -1) return null;

  const prefix = abspath.slice(0, idx);
  if (prefix.endsWith('/Message')) return null;

  const candidate = `${prefix}/Message${abspath.slice(idx)}`;
  try {
    fs.accessSync(candidate, fs.constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Turn a stored media_path from the SQLite archive into an absolute filesystem path
 * suitable for sendFile / fs access. Supports file:// URLs, platform-native separators,
 * and paths relative to WACRAWL_MEDIA_ROOT or the WaCrawl DB directory.
 *
 * When the resolved absolute path doesn't exist, the function checks common WhatsApp
 * directory layout variations (e.g. …/Message/Media vs …/Media) before giving up.
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
  const resolved = path.isAbsolute(p) ? p : path.resolve(getArchiveMediaRoot(), p);

  try {
    fs.accessSync(resolved, fs.constants.R_OK);
    return resolved;
  } catch {
    // Primary path not readable — try WhatsApp layout fallback.
  }

  const fallback = tryWhatsAppMessageMediaFallback(resolved);
  if (fallback) return fallback;

  return resolved;
}

/** Check whether the configured media root is readable. */
export function isMediaRootAccessible(): { accessible: boolean; error?: string } {
  const root = getArchiveMediaRoot();
  try {
    fs.accessSync(root, fs.constants.R_OK);
    return { accessible: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      return {
        accessible: false,
        error:
          'Permission denied. On macOS, grant Full Disk Access to the app running the API server ' +
          '(Terminal, iTerm, etc.) via System Settings \u2192 Privacy & Security \u2192 Full Disk Access.',
      };
    }
    return { accessible: false, error: `Media root is not readable (${code ?? 'unknown error'}).` };
  }
}

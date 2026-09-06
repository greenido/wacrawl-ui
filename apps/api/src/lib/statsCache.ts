import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { getResolvedPaths } from '../runtimePaths.js';

/**
 * Stats responses are pure functions of (archive contents, query params) and the
 * archive is opened read-only, so a result stays valid until the DB file changes.
 *
 * Two things can invalidate an entry:
 *   - the archive fingerprint (path + mtime + size) changes — a re-sync, or the
 *     user pointing the dashboard at a different DB via Settings;
 *   - the time bucket rolls over — period windows like "last week" are relative
 *     to now, so entries expire after STATS_CACHE_TTL_MS.
 *
 * Both live in the key prefix, so a change drops every stale entry at once.
 */
export const STATS_CACHE_TTL_MS = 5 * 60 * 1000;

const MAX_ENTRIES = 100;

const cache = new Map<string, unknown>();
let currentPrefix = '';

function archiveFingerprint(): string {
  const { primaryDb } = getResolvedPaths();
  try {
    const stat = fs.statSync(primaryDb);
    return `${primaryDb}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return `${primaryDb}:unavailable`;
  }
}

/** Stable, collision-free encoding of the query params a route was called with. */
function serializeParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, JSON.stringify(value) ?? 'null'] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/**
 * Build the cache key for a stats request, dropping the cache first if the
 * archive or the time bucket has moved on since the last call.
 */
export function statsCacheKey(route: string, params: Record<string, unknown>, now = Date.now()): string {
  const prefix = `${archiveFingerprint()}|${Math.floor(now / STATS_CACHE_TTL_MS)}`;
  if (prefix !== currentPrefix) {
    cache.clear();
    currentPrefix = prefix;
  }
  return `${prefix}|${route}|${serializeParams(params)}`;
}

/**
 * Strong validator derived from the key. The key already pins the archive state
 * and the params, so a matching If-None-Match means the client holds the current
 * value — we can answer 304 without opening the database at all.
 */
export function etagFor(key: string): string {
  return `"${createHash('sha1').update(key).digest('base64url')}"`;
}

/** Memoize `compute` under `key`. Thrown errors are never cached. */
export function getCached<T>(key: string, compute: () => T): T {
  if (cache.has(key)) {
    const hit = cache.get(key) as T;
    // Re-insert to refresh LRU position.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const value = compute();
  cache.set(key, value);

  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }

  return value;
}

export function clearStatsCache(): void {
  cache.clear();
  currentPrefix = '';
}

export function statsCacheSize(): number {
  return cache.size;
}

import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { closeDb } from '../db.js';
import { requireDashboardRequest } from '../lib/requestGuard.js';
import { clearStatsCache } from '../lib/statsCache.js';
import {
  clearDashboardPathsOverride,
  mergePathPatch,
  readDashboardPathsOverride,
  resolveEffectivePaths,
  resolvePathsFromEnv,
  writeDashboardPathsOverride,
  type PathPatch,
} from '../pathsResolve.js';

export const settingsRouter = Router();

settingsRouter.get('/paths', (_req, res) => {
  const envDefaults = resolvePathsFromEnv();
  const storedOverride = readDashboardPathsOverride();
  const effective = resolveEffectivePaths();

  res.json({
    envDefaults,
    storedOverride,
    effective,
    pathsFile: Boolean(storedOverride && Object.keys(storedOverride).length > 0),
  });
});

const PATH_KEYS = ['whatsappContainer', 'chatDb', 'contactsDb', 'mediaRoot', 'primaryDb'] as const;

const MAX_PATH_LENGTH = 4096;

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');

function validationError(message: string): Error {
  return Object.assign(new Error(message), { code: 'VALIDATION_ERROR' });
}

/**
 * Turn a request body into a patch, or throw a VALIDATION_ERROR.
 *
 * Every field must be a string (blank means "not set") holding an absolute or
 * `~/` path. Relative paths would resolve against whatever directory the server
 * happened to start in.
 */
export function parsePathPatch(body: unknown): PathPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError('JSON body required.');
  }

  const input = body as Record<string, unknown>;
  const patch: PathPatch = {};
  for (const key of PATH_KEYS) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      throw validationError(`${key} must be a string.`);
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_PATH_LENGTH || trimmed.includes('\0')) {
      throw validationError(`${key} is not a valid path.`);
    }
    if (!trimmed.startsWith('~/') && !path.isAbsolute(trimmed)) {
      throw validationError(`${key} must be an absolute path or start with ~/.`);
    }
    patch[key] = trimmed;
  }
  return patch;
}

/**
 * The primary archive is opened by every route and handed to `wacrawl --db … sync`,
 * which would create or write a file at any path saved here. So a new value has
 * to name an SQLite file that already exists. Run `wacrawl sync` once to create
 * a new archive, then point the dashboard at it.
 */
export function assertSqliteFile(filePath: string): void {
  let fd: number | undefined;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw validationError(`Primary database is not a file: ${filePath}`);
    }
    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytes = fs.readSync(fd, header, 0, header.length, 0);
    if (bytes < header.length || !header.equals(SQLITE_HEADER)) {
      throw validationError(`Primary database is not an SQLite file: ${filePath}`);
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') throw error;
    const code = (error as NodeJS.ErrnoException).code;
    throw validationError(code === 'ENOENT'
      ? `Primary database does not exist: ${filePath}. Run wacrawl sync to create it first.`
      : `Cannot read primary database (${code ?? 'unknown error'}): ${filePath}`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Rewrites which archive every route reads and which file sync writes, so it
// gets the same cross-origin guard as starting a sync.
settingsRouter.post('/paths', requireDashboardRequest, (req, res) => {
  const patch = parsePathPatch(req.body);

  const effective = mergePathPatch(resolvePathsFromEnv(), patch);
  // The Settings form sends every field back, so only a changed archive needs
  // checking. That keeps a not-yet-synced default from blocking other edits.
  if (effective.primaryDb !== resolveEffectivePaths().primaryDb) {
    assertSqliteFile(effective.primaryDb);
  }

  writeDashboardPathsOverride(patch);
  closeDb();
  clearStatsCache();

  res.json({ ok: true, effective });
});

settingsRouter.delete('/paths', requireDashboardRequest, (_req, res) => {
  clearDashboardPathsOverride();
  closeDb();
  clearStatsCache();
  res.json({ ok: true, effective: resolvePathsFromEnv() });
});

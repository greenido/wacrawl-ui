import Database from 'better-sqlite3';
import { ensureSearchIndex } from './lib/searchIndex.js';
import { getResolvedPaths } from './runtimePaths.js';

let db: Database.Database | null = null;
let cachedPrimaryDb = '';

export function ensurePrimaryDatabase(): Database.Database {
  const paths = getResolvedPaths();
  const key = paths.primaryDb;
  if (db && cachedPrimaryDb === key) {
    return db;
  }

  db?.close();
  db = new Database(paths.primaryDb, {
    fileMustExist: true,
    readonly: true,
  });
  cachedPrimaryDb = key;
  // A new archive (startup, or a path change in Settings) gets its search index
  // built in the background if it has none yet. Search works without it.
  try {
    ensureSearchIndex(paths.primaryDb);
  } catch (error) {
    console.warn(`Could not start the search index build: ${error instanceof Error ? error.message : String(error)}`);
  }
  return db;
}

export function getDb(): Database.Database {
  return ensurePrimaryDatabase();
}

export function closeDb(): void {
  db?.close();
  db = null;
  cachedPrimaryDb = '';
}

export function getDbPath(): string {
  return getResolvedPaths().primaryDb;
}

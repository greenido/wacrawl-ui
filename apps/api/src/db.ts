import Database from 'better-sqlite3';
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

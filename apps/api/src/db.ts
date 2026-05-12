import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_DB_PATH = path.join(os.homedir(), '.wacrawl', 'wacrawl.db');

let db: Database.Database | null = null;

function resolveDbPath(): string {
  const configuredPath = process.env.WACRAWL_DB?.trim();
  if (!configuredPath) {
    return DEFAULT_DB_PATH;
  }

  if (configuredPath.startsWith('~/')) {
    return path.join(os.homedir(), configuredPath.slice(2));
  }

  return configuredPath;
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(resolveDbPath(), {
      fileMustExist: true,
      readonly: true,
    });
  }

  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export function getDbPath(): string {
  return resolveDbPath();
}

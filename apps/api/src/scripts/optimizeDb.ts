import Database from 'better-sqlite3';
import { getDbPath } from '../db.js';
import { createSearchIndexes } from '../lib/searchIndex.js';

const dbPath = getDbPath();
const db = new Database(dbPath, { fileMustExist: true });

try {
  const startedAt = Date.now();
  createSearchIndexes(db);
  const elapsedMs = Date.now() - startedAt;
  console.log(`Optimized search indexes for ${dbPath} in ${elapsedMs}ms.`);
} finally {
  db.close();
}

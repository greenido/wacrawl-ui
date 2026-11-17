import { getDbPath } from '../db.js';
import { buildSearchIndexSync, searchIndexPath } from '../lib/searchIndex.js';

/**
 * Build the dashboard's search index ahead of time. The server builds it on its
 * own when it is missing or stale, so this is only for warming it up front.
 *
 * The archive is opened readonly: the index goes to its own file.
 */
const dbPath = getDbPath();
const indexPath = searchIndexPath();

const startedAt = Date.now();
const meta = buildSearchIndexSync(dbPath, indexPath);
const elapsedMs = Date.now() - startedAt;
console.log(`Indexed ${meta.messages.toLocaleString('en-US')} messages from ${dbPath} into ${indexPath} in ${elapsedMs}ms.`);

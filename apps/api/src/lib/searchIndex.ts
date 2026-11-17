import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dashboardPathsFile } from '../pathsResolve.js';
import { cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins } from './displayName.js';

/**
 * Full-text search lives in a sidecar SQLite file the dashboard owns, never in
 * the archive.
 *
 * The archive belongs to wacrawl and is only ever opened readonly here. Newer
 * wacrawl versions ship their own `messages_fts`, and the old `optimize-db`
 * script used to drop and replace it, which could break the next import. The
 * sidecar sidesteps that: it is built from a readonly connection, written to its
 * own file, and ATTACHed (readonly, like the archive) when a search runs.
 *
 * A build is a full scan of `messages`, which takes a while on a large archive,
 * so it runs in slices that yield to the event loop between them. Until a build
 * matching the archive's current fingerprint is in place, search keeps using
 * wacrawl's own FTS table if there is one, and LIKE otherwise.
 */

/** wacrawl's own FTS table, inside the archive. Read, never written. */
export const ARCHIVE_FTS_TABLE = 'messages_fts';

/** Named apart from wacrawl's so an unqualified name can never pick the wrong one. */
export const SIDECAR_FTS_TABLE = 'dashboard_fts';
export const SIDECAR_SCHEMA = 'search_idx';

/** Bump when the sidecar's columns or contents change, so old files get rebuilt. */
const SIDECAR_VERSION = '1';

const BATCH_ROWS = 2_000;
/** How long one slice may hold the event loop before yielding. */
const SLICE_MS = 25;

export type SearchIndexState = 'missing' | 'building' | 'ready' | 'stale' | 'failed';

export interface SearchIndexStatus {
  state: SearchIndexState;
  indexPath: string;
  archivePath: string;
  builtAt: string | null;
  /** Messages indexed so far while building, or in the finished index. */
  indexedMessages: number;
  error: string | null;
}

interface SidecarMeta {
  version: string;
  fingerprint: string;
  builtAt: string;
  messages: number;
}

interface RunningBuild {
  archivePath: string;
  indexPath: string;
  indexed: number;
  cancelled: boolean;
  promise: Promise<void>;
}

let running: RunningBuild | null = null;
let lastError: { archivePath: string; indexPath: string; fingerprint: string | null; message: string } | null = null;
/** Keyed by index path and the file's identity, so a swapped file is re-read. */
let metaCache: { key: string; meta: SidecarMeta | null } | null = null;
let buildSeq = 0;

/**
 * Next to the dashboard's paths file by default, which puts it in `~/.wacrawl`
 * normally and in the throwaway directory under `--demo`.
 */
export function searchIndexPath(): string {
  const fromEnv = process.env.WACRAWL_SEARCH_INDEX?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(path.dirname(dashboardPathsFile()), 'dashboard-index.db');
}

function statKey(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

/**
 * Path, mtime and size of the archive, plus its WAL when there is one: wacrawl
 * may write through the WAL, which leaves the main file untouched until a
 * checkpoint.
 */
export function archiveFingerprint(archivePath: string): string | null {
  const resolved = path.resolve(archivePath);
  const main = statKey(resolved);
  if (!main) return null;
  return `${resolved}|${main}|wal:${statKey(`${resolved}-wal`) ?? '-'}`;
}

function readMeta(indexPath: string): SidecarMeta | null {
  const key = `${indexPath}|${statKey(indexPath) ?? 'missing'}`;
  if (metaCache?.key === key) return metaCache.meta;

  let meta: SidecarMeta | null = null;
  if (fs.existsSync(indexPath)) {
    let db: Database.Database | null = null;
    try {
      db = new Database(indexPath, { readonly: true, fileMustExist: true });
      const rows = db.prepare('SELECT key, value FROM index_meta').all() as Array<{ key: string; value: string }>;
      const byKey = new Map(rows.map((row) => [row.key, row.value]));
      meta = {
        version: byKey.get('version') ?? '',
        fingerprint: byKey.get('archive_fingerprint') ?? '',
        builtAt: byKey.get('built_at') ?? '',
        messages: Number(byKey.get('messages') ?? 0),
      };
    } catch {
      // Not ours, or half-written by a crashed process: treated as missing.
      meta = null;
    } finally {
      db?.close();
    }
  }

  metaCache = { key, meta };
  return meta;
}

function isFresh(meta: SidecarMeta | null, archivePath: string): boolean {
  if (!meta || meta.version !== SIDECAR_VERSION) return false;
  const fingerprint = archiveFingerprint(archivePath);
  return fingerprint !== null && meta.fingerprint === fingerprint;
}

export function searchIndexStatus(archivePath: string, indexPath = searchIndexPath()): SearchIndexStatus {
  const meta = readMeta(indexPath);
  const base = {
    indexPath,
    archivePath,
    builtAt: meta?.builtAt || null,
    indexedMessages: meta?.messages ?? 0,
    error: null,
  };

  // A fresh index stays in use while a forced rebuild replaces it.
  if (isFresh(meta, archivePath)) {
    return { ...base, state: 'ready' };
  }
  if (running && running.archivePath === archivePath && running.indexPath === indexPath && !running.cancelled) {
    return { ...base, state: 'building', indexedMessages: running.indexed };
  }
  if (lastError && lastError.archivePath === archivePath && lastError.indexPath === indexPath) {
    return { ...base, state: 'failed', error: lastError.message };
  }
  return { ...base, state: meta ? 'stale' : 'missing' };
}

const SOURCE_SQL = `
  SELECT
    messages.rowid AS rowid,
    COALESCE(messages.text, '') AS text,
    COALESCE(
      ${cleanDisplayNameSql('chats.name')},
      ${cleanDisplayNameSql('messages.chat_name')},
      ${cleanDisplayNameSql('messages.chat_jid')},
      ''
    ) AS chatName,
    COALESCE(
      ${cleanDisplayNameSql('messages.sender_name')},
      ${cleanDisplayNameSql('messages.sender_jid')},
      ''
    ) AS senderName,
    COALESCE(${contactDisplayNameSql('chat_contacts')}, '') AS chatContactName,
    COALESCE(${contactDisplayNameSql('sender_contacts')}, '') AS senderContactName
  FROM messages
  LEFT JOIN chats ON chats.jid = messages.chat_jid
  ${contactLeftJoins('chat_contacts', 'messages.chat_jid')}
  ${contactLeftJoins('sender_contacts', 'messages.sender_jid')}
  WHERE messages.rowid > @after
  ORDER BY messages.rowid
  LIMIT @limit
`;

interface SourceRow {
  rowid: number;
  text: string;
  chatName: string;
  senderName: string;
  chatContactName: string;
  senderContactName: string;
}

/**
 * Index the archive into `tmpPath`, one batch per step. A generator so the
 * caller decides whether to run it straight through or yield between batches.
 */
function* indexBatches(archivePath: string, tmpPath: string, fingerprint: string): Generator<number, void, void> {
  const reader = new Database(archivePath, { readonly: true, fileMustExist: true });
  const writer = new Database(tmpPath);
  try {
    // A crash leaves a temp file that is never renamed into place, so durability
    // only matters at the very end.
    writer.pragma('journal_mode = OFF');
    writer.pragma('synchronous = OFF');
    writer.exec(`
      CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE VIRTUAL TABLE ${SIDECAR_FTS_TABLE} USING fts5(
        text,
        chat_name,
        sender_name,
        chat_contact_name,
        sender_contact_name
      );
    `);

    const select = reader.prepare(SOURCE_SQL);
    const insert = writer.prepare(`
      INSERT INTO ${SIDECAR_FTS_TABLE} (rowid, text, chat_name, sender_name, chat_contact_name, sender_contact_name)
      VALUES (@rowid, @text, @chatName, @senderName, @chatContactName, @senderContactName)
    `);
    const insertBatch = writer.transaction((rows: SourceRow[]) => {
      for (const row of rows) insert.run(row);
    });

    let after = -1;
    let indexed = 0;
    for (;;) {
      const rows = select.all({ after, limit: BATCH_ROWS }) as SourceRow[];
      if (rows.length === 0) break;
      insertBatch(rows);
      after = rows[rows.length - 1].rowid;
      indexed += rows.length;
      yield indexed;
    }

    const setMeta = writer.prepare('INSERT INTO index_meta (key, value) VALUES (?, ?)');
    writer.transaction(() => {
      setMeta.run('version', SIDECAR_VERSION);
      setMeta.run('archive_fingerprint', fingerprint);
      setMeta.run('built_at', new Date().toISOString());
      setMeta.run('messages', String(indexed));
    })();
  } finally {
    reader.close();
    writer.close();
  }
}

function tempPathFor(indexPath: string): string {
  buildSeq += 1;
  return `${indexPath}.${process.pid}.${buildSeq}.tmp`;
}

function removeQuietly(filePath: string): void {
  fs.rmSync(filePath, { force: true });
}

/** Rename into place, so readers only ever see a whole index. */
function publish(tmpPath: string, indexPath: string): void {
  fs.renameSync(tmpPath, indexPath);
  metaCache = null;
}

/**
 * Build the sidecar in one go, blocking until it is done. For `optimize-db`
 * and tests; the server uses `startSearchIndexBuild`.
 */
export function buildSearchIndexSync(archivePath: string, indexPath = searchIndexPath()): SidecarMeta {
  const fingerprint = archiveFingerprint(archivePath);
  if (!fingerprint) throw new Error(`Archive not found: ${archivePath}`);
  // A background build finishing after this one would publish an older result.
  if (running) running.cancelled = true;

  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const tmpPath = tempPathFor(indexPath);
  try {
    for (const _ of indexBatches(archivePath, tmpPath, fingerprint)) {
      // Run straight through.
    }
    publish(tmpPath, indexPath);
  } catch (error) {
    removeQuietly(tmpPath);
    throw error;
  }

  const meta = readMeta(indexPath);
  if (!meta) throw new Error(`Search index at ${indexPath} could not be read back.`);
  return meta;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Build in the background, unless a build for this archive is already running.
 * A build for a different archive or index file is cancelled: its result would
 * be stale on arrival.
 */
export function startSearchIndexBuild(archivePath: string, indexPath = searchIndexPath()): Promise<void> {
  if (running && !running.cancelled) {
    if (running.archivePath === archivePath && running.indexPath === indexPath) return running.promise;
    running.cancelled = true;
  }

  const build: RunningBuild = {
    archivePath,
    indexPath,
    indexed: 0,
    cancelled: false,
    promise: Promise.resolve(),
  };

  build.promise = (async () => {
    let tmpPath: string | null = null;
    let fingerprint: string | null = null;
    try {
      // Never index on the caller's tick: it is usually a request handler, and
      // `running` must be set before this can finish.
      await yieldToEventLoop();
      if (build.cancelled) return;

      fingerprint = archiveFingerprint(archivePath);
      if (!fingerprint) return;

      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      tmpPath = tempPathFor(indexPath);
      let sliceStart = performance.now();
      for (const indexed of indexBatches(archivePath, tmpPath, fingerprint)) {
        build.indexed = indexed;
        // Leaving the loop closes the generator, and with it both connections.
        if (build.cancelled) return;
        if (performance.now() - sliceStart >= SLICE_MS) {
          await yieldToEventLoop();
          sliceStart = performance.now();
        }
      }
      if (build.cancelled) return;
      publish(tmpPath, indexPath);
      lastError = null;
    } catch (error) {
      lastError = {
        archivePath,
        indexPath,
        fingerprint,
        message: error instanceof Error ? error.message : String(error),
      };
      console.warn(`Search index build failed: ${lastError.message}`);
    } finally {
      if (tmpPath) removeQuietly(tmpPath);
      if (running === build) running = null;
    }
  })();

  running = build;
  return build.promise;
}

/**
 * Kick off a build if the sidecar is missing or stale for this archive. Cheap
 * when it is fresh (two stats), so it is safe to call on every search.
 */
export function ensureSearchIndex(archivePath: string, indexPath = searchIndexPath()): SearchIndexStatus {
  const status = searchIndexStatus(archivePath, indexPath);
  // A failure is retried only once the archive changes, not on every keystroke.
  if (status.state === 'missing' || status.state === 'stale') {
    void startSearchIndexBuild(archivePath, indexPath);
    return searchIndexStatus(archivePath, indexPath);
  }
  if (status.state === 'failed' && lastError) {
    if (lastError.fingerprint !== archiveFingerprint(archivePath)) {
      lastError = null;
      void startSearchIndexBuild(archivePath, indexPath);
      return searchIndexStatus(archivePath, indexPath);
    }
  }
  return status;
}

/** A forced rebuild, for after `wacrawl sync` rewrote the archive. */
export function rebuildSearchIndex(archivePath: string, indexPath = searchIndexPath()): Promise<void> {
  lastError = null;
  if (running && running.archivePath === archivePath && running.indexPath === indexPath) {
    running.cancelled = true;
  }
  return startSearchIndexBuild(archivePath, indexPath);
}

/** Wait for whatever build is in flight. Tests and the optimize script use it. */
export async function waitForSearchIndex(): Promise<void> {
  while (running) await running.promise;
}

const attached = new WeakMap<Database.Database, string>();

function isFileDatabase(db: Database.Database): boolean {
  return !db.memory && db.name !== '' && fs.existsSync(db.name);
}

function detach(db: Database.Database): void {
  if (!attached.has(db)) return;
  try {
    db.exec(`DETACH DATABASE ${SIDECAR_SCHEMA}`);
  } catch {
    // Already gone with a closed connection.
  }
  attached.delete(db);
}

/**
 * Make the sidecar available to `db` as `search_idx`, if a fresh one exists.
 * Returns false (and starts a build) otherwise, so the caller falls back.
 *
 * The archive connection is readonly, and an attached database inherits that,
 * so search can never write to the sidecar either.
 */
export function attachSearchIndex(db: Database.Database, indexPath = searchIndexPath()): boolean {
  if (!isFileDatabase(db)) return false;

  const status = ensureSearchIndex(db.name, indexPath);
  if (status.state !== 'ready') {
    detach(db);
    return false;
  }

  // The file is replaced by rename on every rebuild; an attachment keeps
  // reading the old inode until it is re-attached.
  const identity = `${indexPath}|${statKey(indexPath)}`;
  if (attached.get(db) === identity) return true;

  detach(db);
  try {
    db.prepare(`ATTACH DATABASE ? AS ${SIDECAR_SCHEMA}`).run(indexPath);
    attached.set(db, identity);
    return true;
  } catch {
    return false;
  }
}

/** wacrawl 0.3.9+ maintains its own FTS table inside the archive. */
export function hasArchiveFtsTable(db: Database.Database): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM main.sqlite_master
    WHERE type = 'table' AND name = @tableName
  `).get({ tableName: ARCHIVE_FTS_TABLE }) as { count: number };
  return row.count > 0;
}

/** Test seam: forget build state between cases. */
export async function resetSearchIndexState(): Promise<void> {
  if (running) running.cancelled = true;
  await waitForSearchIndex();
  lastError = null;
  metaCache = null;
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachSearchIndex,
  buildSearchIndexSync,
  ensureSearchIndex,
  rebuildSearchIndex,
  resetSearchIndexState,
  searchIndexPath,
  searchIndexStatus,
  SIDECAR_FTS_TABLE,
  startSearchIndexBuild,
  waitForSearchIndex,
} from '../lib/searchIndex.js';
import { searchMessages } from '../routes/data.js';
import { createTestDb } from './testDb.js';

let tmpDir: string;
let archivePath: string;
let indexPath: string;
const open: Database.Database[] = [];

function openArchive(): Database.Database {
  const db = new Database(archivePath, { readonly: true, fileMustExist: true });
  open.push(db);
  return db;
}

/** The archive changing underneath, as `wacrawl sync` does. */
function appendMessage(text: string, sourcePk: number): void {
  const writer = new Database(archivePath);
  writer.prepare(`
    INSERT INTO messages (source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts, from_me, text, raw_type, message_type)
    VALUES (?, 'family@g.us', 'Family', ?, NULL, NULL, 1700500000, 1, ?, 0, 'text')
  `).run(sourcePk, `n${sourcePk}`, text);
  writer.close();
  // Same-millisecond writes would leave mtime alone; size alone may not move either.
  const later = new Date(Date.now() + 5_000);
  fs.utimesSync(archivePath, later, later);
}

function msgIds(db: Database.Database, q: string): string[] {
  return searchMessages({ q, limit: '100' }, db).data.map((message) => message.msgId).sort();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-sidecar-'));
  archivePath = path.join(tmpDir, 'archive.db');
  indexPath = path.join(tmpDir, 'state', 'dashboard-index.db');
  vi.stubEnv('WACRAWL_SEARCH_INDEX', indexPath);
  createTestDb(archivePath).close();
});

afterEach(async () => {
  await resetSearchIndexState();
  for (const db of open.splice(0)) db.close();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('search index location', () => {
  it('sits next to the paths file unless overridden, which keeps a demo inside its temp dir', () => {
    vi.stubEnv('WACRAWL_SEARCH_INDEX', '');
    vi.stubEnv('WACRAWL_PATHS_FILE', path.join(tmpDir, 'demo', 'dashboard-paths.json'));

    expect(searchIndexPath()).toBe(path.join(tmpDir, 'demo', 'dashboard-index.db'));

    vi.stubEnv('WACRAWL_SEARCH_INDEX', path.join(tmpDir, 'elsewhere.db'));
    expect(searchIndexPath()).toBe(path.join(tmpDir, 'elsewhere.db'));
  });
});

describe('buildSearchIndexSync', () => {
  it('writes the index to its own file and leaves the archive byte-for-byte alone', () => {
    const before = fs.readFileSync(archivePath);
    const beforeStat = fs.statSync(archivePath);

    const meta = buildSearchIndexSync(archivePath);

    expect(meta.messages).toBe(6);
    expect(fs.readFileSync(archivePath).equals(before)).toBe(true);
    expect(fs.statSync(archivePath).mtimeMs).toBe(beforeStat.mtimeMs);
    const archive = openArchive();
    expect(archive.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'").pluck().all())
      .toEqual(['chats', 'contacts', 'groups', 'group_participants', 'messages']);

    const sidecar = new Database(indexPath, { readonly: true });
    open.push(sidecar);
    expect(sidecar.prepare(`SELECT COUNT(*) FROM ${SIDECAR_FTS_TABLE}`).pluck().get()).toBe(6);
    expect(fs.readdirSync(path.dirname(indexPath))).toEqual(['dashboard-index.db']);
  });

  it('replaces a file at the index path that is not an index', () => {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, 'not a database');
    expect(searchIndexStatus(archivePath).state).toBe('missing');

    buildSearchIndexSync(archivePath);

    expect(searchIndexStatus(archivePath).state).toBe('ready');
  });

  it('indexes every row across batch boundaries', () => {
    const writer = new Database(archivePath);
    const insert = writer.prepare(`
      INSERT INTO messages (source_pk, chat_jid, msg_id, ts, from_me, text, raw_type)
      VALUES (?, 'family@g.us', ?, 1700000000, 0, ?, 0)
    `);
    writer.transaction(() => {
      for (let i = 0; i < 4_500; i += 1) insert.run(1_000 + i, `bulk${i}`, i === 4_499 ? 'needle at the very end' : 'filler');
    })();
    writer.close();

    expect(buildSearchIndexSync(archivePath).messages).toBe(4_506);
    expect(msgIds(openArchive(), 'needle')).toEqual(['bulk4499']);
  });
});

describe('search with the sidecar', () => {
  it('attaches readonly, so search can never write to it', () => {
    buildSearchIndexSync(archivePath);
    const db = openArchive();

    expect(attachSearchIndex(db)).toBe(true);
    expect(() => db.exec(`INSERT INTO search_idx.${SIDECAR_FTS_TABLE} (text) VALUES ('x')`)).toThrow(/readonly/i);
  });

  it('stops using an index the archive has moved past, and falls back to LIKE until the rebuild lands', async () => {
    buildSearchIndexSync(archivePath);
    const db = openArchive();
    expect(msgIds(db, 'hello update')).toEqual(['m1']);

    appendMessage('hello there, quarterly update', 7);

    expect(searchIndexStatus(archivePath).state).toBe('stale');
    // LIKE wants the exact phrase, so the FTS-only match drops out for now…
    expect(msgIds(db, 'hello update')).toEqual([]);
    // …but nothing new goes missing in the meantime.
    expect(msgIds(db, 'quarterly')).toEqual(['n7']);
    // The search itself queued the rebuild.
    expect(searchIndexStatus(archivePath).state).toBe('building');

    await waitForSearchIndex();

    expect(searchIndexStatus(archivePath)).toMatchObject({ state: 'ready', indexedMessages: 7 });
    expect(msgIds(db, 'hello update')).toEqual(['m1', 'n7']);
  });

  it('builds in the background without blocking the caller, and search works meanwhile', async () => {
    const db = openArchive();
    expect(searchIndexStatus(archivePath).state).toBe('missing');

    const build = startSearchIndexBuild(archivePath);

    // Nothing happened on this tick: the build starts after the caller returns.
    expect(fs.existsSync(indexPath)).toBe(false);
    expect(searchIndexStatus(archivePath).state).toBe('building');
    expect(msgIds(db, 'family')).toEqual(['m3', 'm4', 'm5']);

    await build;

    expect(searchIndexStatus(archivePath).state).toBe('ready');
    expect(msgIds(db, 'hello update')).toEqual(['m1']);
  });

  it('starts one build however many searches ask for it', async () => {
    const first = ensureSearchIndex(archivePath);
    const second = ensureSearchIndex(archivePath);

    expect(first.state).toBe('building');
    expect(second.state).toBe('building');
    expect(startSearchIndexBuild(archivePath)).toBe(startSearchIndexBuild(archivePath));
    await waitForSearchIndex();
    expect(fs.readdirSync(path.dirname(indexPath))).toEqual(['dashboard-index.db']);
  });

  it('re-attaches after a rebuild swaps the file underneath an open connection', async () => {
    buildSearchIndexSync(archivePath);
    const db = openArchive();
    expect(msgIds(db, 'hello update')).toEqual(['m1']);

    appendMessage('hello again with an update', 8);
    await rebuildSearchIndex(archivePath);

    expect(msgIds(db, 'hello update')).toEqual(['m1', 'n8']);
  });

  it('keeps search working when the index cannot be written', async () => {
    const blocker = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blocker, '');
    // A path under a regular file can never be created.
    vi.stubEnv('WACRAWL_SEARCH_INDEX', path.join(blocker, 'dashboard-index.db'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = openArchive();

    expect(msgIds(db, 'family')).toEqual(['m3', 'm4', 'm5']);
    await waitForSearchIndex();

    expect(searchIndexStatus(archivePath).state).toBe('failed');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Search index build failed'));
    // A failure is not retried on every search, only once the archive changes.
    ensureSearchIndex(archivePath);
    expect(searchIndexStatus(archivePath).state).toBe('failed');
    expect(msgIds(db, 'family')).toEqual(['m3', 'm4', 'm5']);
  });
});

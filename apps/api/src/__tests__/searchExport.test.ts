import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from '../lib/csv.js';
import { exportSearchResults, SEARCH_EXPORT_MAX_ROWS } from '../routes/data.js';
import { createTestDb } from './testDb.js';

describe('CSV escaping', () => {
  it('quotes cells holding commas, quotes, line breaks or edge spaces', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
    expect(escapeCsvCell('two\nlines')).toBe('"two\nlines"');
    expect(escapeCsvCell('cr\rhere')).toBe('"cr\rhere"');
    expect(escapeCsvCell(' padded ')).toBe('" padded "');
  });

  it.each([
    ['=HYPERLINK("http://example.com","x")', `"'=HYPERLINK(""http://example.com"",""x"")"`],
    ['+1 555 0100', "'+1 555 0100"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['\t=1', "'\t=1"],
    ['\r=1', `"'\r=1"`],
  ])('neutralises the formula in %j', (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it('leaves numbers, booleans and empties as data', () => {
    expect(escapeCsvCell(-42)).toBe('-42');
    expect(escapeCsvCell(3.5)).toBe('3.5');
    expect(escapeCsvCell(Number.NaN)).toBe('');
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
    expect(escapeCsvCell('a = b')).toBe('a = b');
  });

  it('writes a BOM, a header and CRLF rows', () => {
    const csv = toCsv([
      { header: 'name', value: (row: { name: string; n: number }) => row.name },
      { header: 'n', value: (row) => row.n },
    ], [{ name: 'Ada', n: 1 }, { name: '=cmd', n: -1 }]);

    expect(csv).toBe("\uFEFFname,n\r\nAda,1\r\n'=cmd,-1\r\n");
  });
});

describe('exportSearchResults', () => {
  const now = new Date('2026-03-04T05:06:07Z');

  it('exports every match, not just the first page', () => {
    const db = createTestDb();
    const insert = db.prepare(`
      INSERT INTO messages (source_pk, chat_jid, chat_name, msg_id, ts, from_me, text, raw_type)
      VALUES (?, 'family@g.us', 'Family', ?, ?, 0, 'family photo', 0)
    `);
    for (let i = 0; i < 150; i += 1) insert.run(100 + i, `bulk${i}`, 1_600_000_000 + i);

    const result = exportSearchResults({ q: 'family', format: 'json', limit: '10', offset: '20' }, db, now);
    const body = JSON.parse(result.body);

    // 150 bulk rows plus the 3 fixture messages; limit and offset are for paging, not export.
    expect(result).toMatchObject({ total: 153, exported: 153, truncated: false, filename: 'wacrawl-search-2026-03-04.json' });
    expect(body.messages).toHaveLength(153);
    expect(body.query).toEqual({ q: 'family' });
    expect(body.messages[0]).not.toHaveProperty('snippet');
    db.close();
  });

  it('caps the export and says so', () => {
    const db = createTestDb();
    const insert = db.prepare(`
      INSERT INTO messages (source_pk, chat_jid, msg_id, ts, from_me, text, raw_type)
      VALUES (?, 'family@g.us', ?, ?, 0, 'bulk', 0)
    `);
    db.transaction(() => {
      for (let i = 0; i <= SEARCH_EXPORT_MAX_ROWS; i += 1) insert.run(100 + i, `bulk${i}`, 1_600_000_000 + i);
    })();

    const result = exportSearchResults({ chat: 'family@g.us', format: 'csv' }, db, now);

    expect(result.total).toBe(SEARCH_EXPORT_MAX_ROWS + 4);
    expect(result.exported).toBe(SEARCH_EXPORT_MAX_ROWS);
    expect(result.truncated).toBe(true);
    // Header + rows, each CRLF-terminated.
    expect(result.body.split('\r\n')).toHaveLength(SEARCH_EXPORT_MAX_ROWS + 2);
    db.close();
  });

  it('rejects an unknown format', () => {
    const db = createTestDb();
    expect(() => exportSearchResults({ q: 'family', format: 'xlsx' }, db)).toThrow('format must be csv or json.');
    db.close();
  });
});

describe('GET /api/search/export', () => {
  let server: Server;
  let baseUrl: string;
  let tmpDir: string;

  function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    });
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-export-'));
    const dbPath = path.join(tmpDir, 'archive.db');
    const db = createTestDb(dbPath);
    // Text another participant could have typed to attack whoever opens the export.
    db.prepare(`
      INSERT INTO messages (source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts, from_me, text, raw_type, message_type)
      VALUES (7, 'family@g.us', 'Family', 'evil', 'bob@s.whatsapp.net', 'Bob', 1700500000, 0, '=HYPERLINK("http://example.com/x","family, click")', 0, 'text')
    `).run();
    db.close();

    const port = await freePort();
    process.env.PORT = String(port);
    process.env.WACRAWL_DB = dbPath;
    process.env.WACRAWL_PATHS_FILE = path.join(tmpDir, 'no-such-paths.json');

    const { createApp } = await import('../index.js');
    server = createApp().listen(port, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('downloads all matches as CSV with formula cells neutralised', async () => {
    const response = await fetch(`${baseUrl}/api/search/export?q=family&chat=${encodeURIComponent('family@g.us')}&format=csv`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="wacrawl-search-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-total-count')).toBe('4');
    expect(response.headers.get('x-export-count')).toBe('4');
    expect(response.headers.get('x-export-truncated')).toBe('false');

    const text = await response.text();
    const lines = text.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe('sent_at,chat,chat_jid,sender,sender_jid,from_me,message_type,media_type,text,message_id');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://example.com/x"",""family, click"")"`);
    expect(lines.some((line) => line.includes(',You,,true,'))).toBe(true);
  });

  it('downloads JSON for the same params', async () => {
    const response = await fetch(`${baseUrl}/api/search/export?q=family&sender=me&format=json`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(/filename="wacrawl-search-[\d-]+\.json"/);
    const body = await response.json();
    expect(body).toMatchObject({ total: 1, exported: 1, truncated: false, query: { q: 'family', sender: 'me' } });
    expect(body.messages[0]).toMatchObject({ msgId: 'm4', fromMe: true, text: 'sounds good family' });
  });

  it('reports bad params as a 400, like /api/search', async () => {
    const badFormat = await fetch(`${baseUrl}/api/search/export?q=family&format=xml`);
    expect(badFormat.status).toBe(400);
    await expect(badFormat.json()).resolves.toEqual({ error: { code: 'VALIDATION_ERROR', message: 'format must be csv or json.' } });

    const badFilter = await fetch(`${baseUrl}/api/search/export?from=yesterday`);
    expect(badFilter.status).toBe(400);
  });

  it('never wrote to the archive while serving and indexing it', async () => {
    const { waitForSearchIndex, searchIndexStatus } = await import('../lib/searchIndex.js');
    await waitForSearchIndex();
    const archive = new Database(process.env.WACRAWL_DB!, { readonly: true });
    const tables = archive.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%fts%'").pluck().all();
    archive.close();

    expect(tables).toEqual([]);
    expect(searchIndexStatus(process.env.WACRAWL_DB!).state).toBe('ready');
  });
});

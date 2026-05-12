import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { sinceTimestamp, unixSecondsToIso } from '../lib/query.js';
import { getActivityHeatmap, getMessageVolume, getOverviewStats, getTopContacts } from '../routes/stats.js';

let db: Database.Database | null = null;

function createTestDb(): Database.Database {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE chats (
      jid TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT,
      last_message_at INTEGER
    );
    CREATE TABLE contacts (
      jid TEXT PRIMARY KEY,
      full_name TEXT
    );
    CREATE TABLE messages (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      source_pk INTEGER NOT NULL UNIQUE,
      chat_jid TEXT NOT NULL,
      chat_name TEXT,
      msg_id TEXT NOT NULL,
      sender_jid TEXT,
      sender_name TEXT,
      ts INTEGER NOT NULL,
      from_me INTEGER NOT NULL,
      text TEXT,
      raw_type INTEGER NOT NULL,
      message_type TEXT,
      media_type TEXT,
      media_path TEXT,
      media_size INTEGER
    );
  `);
  db.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)').run('alice@s.whatsapp.net', 'direct', 'Alice', 1_700_000_000);
  db.prepare('INSERT INTO contacts (jid, full_name) VALUES (?, ?)').run('alice@s.whatsapp.net', 'Alice Example');

  const insertMessage = db.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertMessage.run(1, 'alice@s.whatsapp.net', 'Alice', 'm1', null, null, 1_700_000_000, 1, 'hello', 0, 'text', null, null, null);
  insertMessage.run(2, 'alice@s.whatsapp.net', 'Alice', 'm2', 'alice@s.whatsapp.net', 'Alice', 1_700_086_400, 0, 'photo', 0, 'image', 'image', '/tmp/photo.jpg', 100);
  insertMessage.run(3, 'group@g.us', 'Group', 'm3', 'bob@s.whatsapp.net', 'Bob', 1_700_172_800, 0, 'hey', 0, 'text', null, null, null);

  return db;
}

afterEach(() => {
  db?.close();
  db = null;
});

describe('stats queries', () => {
  it('returns overview counts and ISO date bounds', () => {
    const stats = getOverviewStats(createTestDb());

    expect(stats).toEqual({
      totalMessages: 3,
      totalChats: 1,
      totalContacts: 1,
      totalMediaFiles: 1,
      oldestMessage: '2023-11-14T22:13:20.000Z',
      newestMessage: '2023-11-16T22:13:20.000Z',
    });
  });

  it('groups top contacts by counterparty jid', () => {
    const contacts = getTopContacts({ period: 'all', limit: '5' }, createTestDb());

    expect(contacts[0]).toMatchObject({
      jid: 'alice@s.whatsapp.net',
      name: 'Alice',
      messageCount: 2,
      sentByMe: 1,
      sentByThem: 1,
    });
  });

  it('falls back to contact or chat names when sender names are encoded placeholders', () => {
    const testDb = createTestDb();
    testDb.prepare('INSERT INTO contacts (jid, full_name) VALUES (?, ?)').run('dave@s.whatsapp.net', 'Dave Contact');
    const insertMessage = testDb.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMessage.run(4, 'charlie@s.whatsapp.net', 'Charlie Chat', 'm4', 'charlie@s.whatsapp.net', 'IAA=', 1_700_259_200, 0, 'hi', 0, 'text', null, null, null);
    insertMessage.run(5, 'family@g.us', 'Family Group', 'm5', 'dave@s.whatsapp.net', 'IAA=', 1_700_345_600, 0, 'group hi', 0, 'text', null, null, null);

    const contacts = getTopContacts({ period: 'all', limit: '10' }, testDb);

    expect(contacts.find((contact) => contact.jid === 'charlie@s.whatsapp.net')?.name).toBe('Charlie Chat');
    expect(contacts.find((contact) => contact.jid === 'dave@s.whatsapp.net')?.name).toBe('Dave Contact');
  });

  it('buckets message volume by day', () => {
    const volume = getMessageVolume({ period: 'all', granularity: 'day' }, createTestDb());

    expect(volume).toEqual([
      { date: '2023-11-14', sent: 1, received: 0 },
      { date: '2023-11-15', sent: 0, received: 1 },
      { date: '2023-11-16', sent: 0, received: 1 },
    ]);
  });

  it('returns activity heatmap points for the requested year', () => {
    const points = getActivityHeatmap({ year: '2023' }, createTestDb());

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ date: '2023-11-14', count: 1 });
  });
});

describe('query helpers', () => {
  it('treats WaCrawl timestamps as Unix seconds for the current schema', () => {
    expect(unixSecondsToIso(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z');
  });

  it('computes period cutoffs in Unix seconds', () => {
    expect(sinceTimestamp('day', 1_700_086_400_000)).toBe(1_700_000_000);
  });
});

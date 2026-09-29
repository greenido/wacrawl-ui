import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getArchivedChats } from '../routes/stats.js';
import { createEmptyDb } from './testDb.js';

let db: Database.Database | null = null;

const NOW = new Date('2024-06-01T00:00:00Z');
const NOW_TS = Math.floor(NOW.getTime() / 1000);
const DAY = 86_400;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  db?.close();
  db = null;
});

/** The shared fixture mirrors older archives, which predate `chats.archived`. */
function withArchivedColumn(database: Database.Database): Database.Database {
  database.exec('ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  return database;
}

function chat(
  database: Database.Database,
  jid: string,
  kind: string,
  archived: boolean,
  messages: Array<{ daysAgo: number; fromMe?: boolean }> = [],
): void {
  database.prepare('INSERT INTO chats (jid, kind, name, archived) VALUES (?, ?, ?, ?)')
    .run(jid, kind, jid.split('@')[0], archived ? 1 : 0);
  const insert = database.prepare(`
    INSERT INTO messages (source_pk, chat_jid, msg_id, ts, from_me, text, raw_type)
    VALUES (?, ?, ?, ?, ?, 'hi', 0)
  `);
  let pk = (database.prepare('SELECT COALESCE(MAX(source_pk), 0) AS max FROM messages').get() as { max: number }).max;
  for (const message of messages) {
    pk += 1;
    insert.run(pk, jid, `${jid}-${pk}`, NOW_TS - message.daysAgo * DAY, message.fromMe ? 1 : 0);
  }
}

describe('getArchivedChats', () => {
  it('reports the column as unavailable on archives that lack it', () => {
    db = createEmptyDb();

    const report = getArchivedChats({}, db);

    expect(report.available).toBe(false);
    expect(report.stillActive).toEqual([]);
  });

  it('counts archived chats by kind and ignores the status pseudo-chat', () => {
    db = withArchivedColumn(createEmptyDb());
    chat(db, 'alice@s.whatsapp.net', 'dm', true);
    chat(db, 'bob@s.whatsapp.net', 'direct', false);
    chat(db, 'family@g.us', 'group', true);
    chat(db, 'status@broadcast', 'status', true);

    const report = getArchivedChats({}, db);

    expect(report).toMatchObject({ available: true, totalChats: 3, archivedChats: 2, archivedDirect: 1, archivedGroups: 1 });
  });

  it('lists archived chats with traffic inside the window, busiest first', () => {
    db = withArchivedColumn(createEmptyDb());
    chat(db, 'quiet@s.whatsapp.net', 'dm', true, [{ daysAgo: 90 }]);
    chat(db, 'chatty@g.us', 'group', true, [{ daysAgo: 1 }, { daysAgo: 2 }, { daysAgo: 3, fromMe: true }]);
    chat(db, 'alive@s.whatsapp.net', 'dm', true, [{ daysAgo: 5 }]);
    chat(db, 'unarchived@s.whatsapp.net', 'dm', false, [{ daysAgo: 1 }, { daysAgo: 1 }, { daysAgo: 1 }, { daysAgo: 1 }]);

    const report = getArchivedChats({ windowDays: '30' }, db);

    expect(report.stillActiveCount).toBe(2);
    expect(report.stillActive.map((entry) => entry.jid)).toEqual(['chatty@g.us', 'alive@s.whatsapp.net']);
    expect(report.stillActive[0]).toMatchObject({ kind: 'group', recentMessages: 3, recentFromMe: 1 });
    expect(report.stillActive[1].kind).toBe('direct');
  });
});

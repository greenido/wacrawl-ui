import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConversationDynamics } from '../routes/stats.js';
import { createEmptyDb } from './testDb.js';

let db: Database.Database | null = null;

const NOW = new Date('2024-03-10T12:00:00Z');
const NOW_TS = Math.floor(NOW.getTime() / 1000);
const HOUR = 3600;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  db?.close();
  db = null;
});

function seed(database: Database.Database, jid: string, messages: Array<{ ts: number; fromMe: boolean }>): void {
  database
    .prepare('INSERT OR IGNORE INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run(jid, 'direct', jid.split('@')[0], null);

  const insert = database.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'msg', 0, 'text', NULL, NULL, NULL)
  `);
  const base = (database.prepare('SELECT COALESCE(MAX(source_pk), 0) AS max FROM messages').get() as { max: number }).max;
  messages.forEach((message, index) => {
    insert.run(
      base + index + 1,
      jid,
      jid,
      `${jid}-${index}`,
      message.fromMe ? null : jid,
      message.fromMe ? null : jid,
      message.ts,
      message.fromMe ? 1 : 0,
    );
  });
}

function ghostFor(jid: string, database: Database.Database) {
  return getConversationDynamics({ period: 'all', limit: '10' }, database)
    .ghostScore.find((entry) => entry.jid === jid);
}

describe('ghost score', () => {
  it('does not score messages that are still inside the reply window', () => {
    db = createEmptyDb();
    // Three answered exchanges, then two messages sent in the last hour that
    // simply have not been answered yet.
    seed(db, 'live@s.whatsapp.net', [
      { ts: NOW_TS - 30 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 30 * 24 * HOUR + 60, fromMe: false },
      { ts: NOW_TS - 20 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 20 * 24 * HOUR + 60, fromMe: false },
      { ts: NOW_TS - 10 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 10 * 24 * HOUR + 60, fromMe: false },
      { ts: NOW_TS - 2 * HOUR, fromMe: true },
      { ts: NOW_TS - 1 * HOUR, fromMe: true },
    ]);

    // The two recent messages are excluded outright rather than counted against
    // the contact, so this reads as a perfectly responsive chat.
    expect(ghostFor('live@s.whatsapp.net', db)).toMatchObject({
      totalSent: 3,
      ghostedCount: 0,
      ghostRate: 0,
    });
  });

  it('still counts an old message that was never answered', () => {
    db = createEmptyDb();
    seed(db, 'cold@s.whatsapp.net', [
      { ts: NOW_TS - 60 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 60 * 24 * HOUR + 60, fromMe: false },
      { ts: NOW_TS - 50 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 40 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 30 * 24 * HOUR, fromMe: true },
    ]);

    expect(ghostFor('cold@s.whatsapp.net', db)).toMatchObject({
      totalSent: 4,
      ghostedCount: 3,
    });
  });

  it('treats a reply after the window as a ghost, not a reply', () => {
    db = createEmptyDb();
    seed(db, 'slow@s.whatsapp.net', [
      { ts: NOW_TS - 90 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 90 * 24 * HOUR + 23 * HOUR, fromMe: false },
      { ts: NOW_TS - 80 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 80 * 24 * HOUR + 25 * HOUR, fromMe: false },
      { ts: NOW_TS - 70 * 24 * HOUR, fromMe: true },
      { ts: NOW_TS - 70 * 24 * HOUR + HOUR, fromMe: false },
    ]);

    expect(ghostFor('slow@s.whatsapp.net', db)).toMatchObject({
      totalSent: 3,
      ghostedCount: 1,
    });
  });

  it('drops a chat whose only sent messages are too recent to judge', () => {
    db = createEmptyDb();
    seed(db, 'fresh@s.whatsapp.net', [
      { ts: NOW_TS - 4 * HOUR, fromMe: false },
      { ts: NOW_TS - 3 * HOUR, fromMe: true },
      { ts: NOW_TS - 2 * HOUR, fromMe: true },
    ]);

    expect(ghostFor('fresh@s.whatsapp.net', db)).toBeUndefined();
  });
});

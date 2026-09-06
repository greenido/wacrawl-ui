import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatNotFoundError, getContactProfile } from '../routes/stats.js';
import { createEmptyDb, createTestDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

const JID = 'alice@s.whatsapp.net';
const BASE_TS = Date.UTC(2023, 0, 2) / 1000; // A Monday, 00:00 UTC.
const HOUR = 3600;
const DAY = 86_400;

interface Msg {
  ts: number;
  fromMe: boolean;
  text?: string;
  mediaType?: string;
}

function seed(database: Database.Database, messages: Msg[], jid = JID, kind = 'direct'): void {
  database
    .prepare('INSERT OR IGNORE INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run(jid, kind, 'Alice', null);
  database
    .prepare('INSERT OR IGNORE INTO contacts (jid, phone, full_name) VALUES (?, ?, ?)')
    .run(jid, '+972500000000', 'Alice Example');

  const insert = database.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, 'Alice', ?, NULL, NULL, ?, ?, ?, 0, 'text', ?, NULL, ?)
  `);
  const base = (database.prepare('SELECT COALESCE(MAX(source_pk), 0) AS max FROM messages').get() as { max: number }).max;
  messages.forEach((message, index) => {
    insert.run(
      base + index + 1,
      jid,
      `m${base + index}`,
      message.ts,
      message.fromMe ? 1 : 0,
      message.text ?? null,
      message.mediaType ?? null,
      message.mediaType ? 1024 : null,
    );
  });
}

describe('getContactProfile', () => {
  it('404s rather than inventing an empty profile', () => {
    db = createTestDb();

    expect(() => getContactProfile({ jid: 'nobody@s.whatsapp.net' }, db)).toThrow(ChatNotFoundError);
    expect(() => getContactProfile({}, db)).toThrow(ChatNotFoundError);
  });

  it('carries identity through from chats and contacts', () => {
    db = createEmptyDb();
    seed(db, [{ ts: BASE_TS, fromMe: true, text: 'hi' }]);

    const profile = getContactProfile({ jid: JID }, db);

    expect(profile).toMatchObject({ jid: JID, name: 'Alice', kind: 'direct', phone: '+972500000000' });
  });

  it('counts totals exactly and in the viewer calendar', () => {
    db = createEmptyDb();
    seed(db, [
      { ts: BASE_TS, fromMe: true, text: 'one' },
      { ts: BASE_TS + HOUR, fromMe: false, text: 'two' },
      { ts: BASE_TS + DAY, fromMe: false, text: 'three', mediaType: 'image' },
      { ts: BASE_TS + 2 * DAY, fromMe: true, text: 'four', mediaType: 'video' },
    ]);

    const { totals } = getContactProfile({ jid: JID }, db);

    expect(totals).toMatchObject({
      messages: 4,
      sentByMe: 2,
      sentByThem: 2,
      media: 2,
      activeDays: 3,
      firstMessageAt: '2023-01-02T00:00:00.000Z',
    });
  });

  it('splits reply latency by direction inside a session', () => {
    db = createEmptyDb();
    seed(db, [
      { ts: BASE_TS, fromMe: false },
      { ts: BASE_TS + 60, fromMe: true },       // mine: 60s
      { ts: BASE_TS + 60 + 900, fromMe: false }, // theirs: 900s
      { ts: BASE_TS + 60 + 900 + 60, fromMe: true }, // mine: 60s
    ]);

    const { latency } = getContactProfile({ jid: JID }, db);

    expect(latency.mine).toMatchObject({ count: 2, medianSeconds: 60 });
    expect(latency.theirs).toMatchObject({ count: 1, medianSeconds: 900 });
  });

  it('attributes openings and closings around each lull', () => {
    db = createEmptyDb();
    seed(db, [
      // Session 1: they open, I close.
      { ts: BASE_TS, fromMe: false },
      { ts: BASE_TS + 60, fromMe: true },
      // Session 2, five days later: I open, they close.
      { ts: BASE_TS + 5 * DAY, fromMe: true },
      { ts: BASE_TS + 5 * DAY + 60, fromMe: false },
    ]);

    const { initiation, lastWord } = getContactProfile({ jid: JID }, db);

    expect(initiation).toEqual({ byMe: 1, byThem: 1 });
    expect(lastWord).toEqual({ mine: 1, theirs: 1 });
  });

  it('finds the longest silence and when it broke', () => {
    db = createEmptyDb();
    seed(db, [
      { ts: BASE_TS, fromMe: true },
      { ts: BASE_TS + 10 * DAY, fromMe: false },
      { ts: BASE_TS + 100 * DAY, fromMe: true },
      { ts: BASE_TS + 105 * DAY, fromMe: false },
    ]);

    expect(getContactProfile({ jid: JID }, db).longestSilence).toMatchObject({
      days: 90,
      startedAt: new Date((BASE_TS + 10 * DAY) * 1000).toISOString(),
      endedAt: new Date((BASE_TS + 100 * DAY) * 1000).toISOString(),
    });
  });

  it('has no longest silence when the chat never went quiet', () => {
    db = createEmptyDb();
    seed(db, [
      { ts: BASE_TS, fromMe: true },
      { ts: BASE_TS + 60, fromMe: false },
    ]);

    expect(getContactProfile({ jid: JID }, db).longestSilence).toBeNull();
  });

  it('pulls out words and emoji the conversation is actually about', () => {
    db = createEmptyDb();
    seed(db, [
      { ts: BASE_TS, fromMe: true, text: 'the deploy is ready 🚀' },
      { ts: BASE_TS + 60, fromMe: false, text: 'deploy looks good 🚀🎉' },
    ]);

    const profile = getContactProfile({ jid: JID }, db);

    expect(profile.topWords[0]).toEqual({ text: 'deploy', value: 2 });
    // "the" and "is" are filler and must not outrank it.
    expect(profile.topWords.map((w) => w.text)).not.toContain('the');
    expect(profile.topEmojis[0]).toEqual({ emoji: '🚀', count: 2 });
  });

  it('buckets volume by month and hour in the requested zone', () => {
    db = createEmptyDb();
    // 22:30 UTC on 31 January is 00:30 on 1 February in Jerusalem.
    const lateJan = Date.UTC(2023, 0, 31, 22, 30) / 1000;
    seed(db, [{ ts: lateJan, fromMe: true, text: 'late' }]);

    const utc = getContactProfile({ jid: JID }, db);
    const local = getContactProfile({ jid: JID, timeZone: 'Asia/Jerusalem' }, db);

    expect(utc.monthlyVolume).toEqual([{ month: '2023-01', sent: 1, received: 0 }]);
    expect(utc.hourOfDay).toEqual([{ hour: 22, count: 1 }]);
    expect(local.monthlyVolume).toEqual([{ month: '2023-02', sent: 1, received: 0 }]);
    expect(local.hourOfDay).toEqual([{ hour: 0, count: 1 }]);
  });

  it('breaks media down by type', () => {
    db = createEmptyDb();
    seed(db, [
      { ts: BASE_TS, fromMe: true, mediaType: 'image' },
      { ts: BASE_TS + 60, fromMe: false, mediaType: 'image' },
      { ts: BASE_TS + 120, fromMe: false, mediaType: 'audio' },
    ]);

    expect(getContactProfile({ jid: JID }, db).mediaBreakdown).toEqual([
      { mediaType: 'image', count: 2, totalBytes: 2048 },
      { mediaType: 'audio', count: 1, totalBytes: 1024 },
    ]);
  });
});

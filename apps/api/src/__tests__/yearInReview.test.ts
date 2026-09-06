import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getYearInReview } from '../routes/stats.js';
import { createEmptyDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

const HOUR = 3600;
const DAY = 86_400;

function utc(year: number, month: number, day: number, hour = 12): number {
  return Date.UTC(year, month - 1, day, hour) / 1000;
}

interface Msg {
  ts: number;
  fromMe?: boolean;
  text?: string;
  mediaType?: string;
}

function seed(database: Database.Database, jid: string, name: string, messages: Msg[], kind = 'direct'): void {
  database
    .prepare('INSERT OR IGNORE INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run(jid, kind, name, null);

  const insert = database.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, 'text', ?, NULL, ?)
  `);
  const base = (database.prepare('SELECT COALESCE(MAX(source_pk), 0) AS max FROM messages').get() as { max: number }).max;
  messages.forEach((message, index) => {
    insert.run(
      base + index + 1,
      jid,
      name,
      `${jid}-${base + index}`,
      message.ts,
      message.fromMe ? 1 : 0,
      message.text ?? null,
      message.mediaType ?? null,
      message.mediaType ? 2048 : null,
    );
  });
}

describe('getYearInReview', () => {
  it('counts only the requested year', () => {
    db = createEmptyDb();
    seed(db, 'a@s.whatsapp.net', 'A', [
      { ts: utc(2022, 12, 31), fromMe: true },
      { ts: utc(2023, 1, 1), fromMe: true },
      { ts: utc(2023, 6, 15), fromMe: false, mediaType: 'image' },
      { ts: utc(2023, 12, 31), fromMe: false },
      { ts: utc(2024, 1, 1), fromMe: true },
    ]);

    const review = getYearInReview({ year: '2023' }, db);

    expect(review.year).toBe(2023);
    expect(review.totals).toMatchObject({
      messages: 3,
      sent: 1,
      received: 2,
      media: 1,
      chats: 1,
      activeDays: 3,
    });
  });

  it('returns an empty but well-formed review for a year with no traffic', () => {
    db = createEmptyDb();
    seed(db, 'a@s.whatsapp.net', 'A', [{ ts: utc(2023, 5, 5), fromMe: true }]);

    const review = getYearInReview({ year: '2019' }, db);

    expect(review.totals.messages).toBe(0);
    expect(review.busiestDay).toBeNull();
    expect(review.busiestMonth).toBeNull();
    expect(review.longestStreakDays).toBe(0);
    expect(review.topChats).toEqual([]);
    expect(review.previousYear).toBeNull();
  });

  it('finds the busiest day and the longest run of consecutive days', () => {
    db = createEmptyDb();
    const start = utc(2023, 3, 1);
    seed(db, 'a@s.whatsapp.net', 'A', [
      // Four days in a row, then a gap, then two.
      { ts: start },
      { ts: start + DAY },
      { ts: start + DAY + HOUR },
      { ts: start + DAY + 2 * HOUR },
      { ts: start + 2 * DAY },
      { ts: start + 3 * DAY },
      { ts: start + 10 * DAY },
      { ts: start + 11 * DAY },
    ]);

    const review = getYearInReview({ year: '2023' }, db);

    expect(review.longestStreakDays).toBe(4);
    expect(review.busiestDay).toEqual({ date: '2023-03-02', count: 3 });
    expect(review.busiestMonth).toEqual({ month: '2023-03', count: 8 });
  });

  it('ranks chats within the year and names them', () => {
    db = createEmptyDb();
    seed(db, 'busy@s.whatsapp.net', 'Busy Friend', [
      { ts: utc(2023, 2, 1) },
      { ts: utc(2023, 2, 2) },
      { ts: utc(2023, 2, 3) },
    ]);
    seed(db, 'team@g.us', 'Team', [{ ts: utc(2023, 2, 1) }], 'group');
    // Heavy in a different year, so it must not appear.
    seed(db, 'old@s.whatsapp.net', 'Old', [
      { ts: utc(2021, 2, 1) },
      { ts: utc(2021, 2, 2) },
      { ts: utc(2021, 2, 3) },
      { ts: utc(2021, 2, 4) },
    ]);

    expect(getYearInReview({ year: '2023' }, db).topChats).toEqual([
      { jid: 'busy@s.whatsapp.net', kind: 'direct', name: 'Busy Friend', messageCount: 3 },
      { jid: 'team@g.us', kind: 'group', name: 'Team', messageCount: 1 },
    ]);
  });

  it('counts a contact as new only on their first message ever', () => {
    db = createEmptyDb();
    seed(db, 'fresh@s.whatsapp.net', 'Fresh', [
      { ts: utc(2023, 4, 1) },
      { ts: utc(2023, 4, 2) },
    ]);
    // Revived in 2023 after starting in 2020 — not a new contact.
    seed(db, 'revived@s.whatsapp.net', 'Revived', [
      { ts: utc(2020, 1, 1) },
      { ts: utc(2023, 7, 1) },
    ]);

    const { newContacts } = getYearInReview({ year: '2023' }, db);

    expect(newContacts.map((c) => c.jid)).toEqual(['fresh@s.whatsapp.net']);
    expect(newContacts[0]).toMatchObject({ name: 'Fresh', messageCount: 2 });
  });

  it('compares against the previous year', () => {
    db = createEmptyDb();
    seed(db, 'a@s.whatsapp.net', 'A', [
      { ts: utc(2022, 5, 1) },
      { ts: utc(2022, 5, 2) },
      { ts: utc(2022, 5, 3) },
      { ts: utc(2022, 5, 4) },
      { ts: utc(2023, 5, 1) },
      { ts: utc(2023, 5, 2) },
    ]);

    // Two messages against four is a 50% fall.
    expect(getYearInReview({ year: '2023' }, db).previousYear).toEqual({ messages: 4, changeRatio: -0.5 });
  });

  it('respects the viewer timezone at the year boundary', () => {
    db = createEmptyDb();
    // 22:30 UTC on 31 December 2022 is already 2023 in Jerusalem.
    seed(db, 'a@s.whatsapp.net', 'A', [{ ts: Date.UTC(2022, 11, 31, 22, 30) / 1000 }]);

    expect(getYearInReview({ year: '2023' }, db).totals.messages).toBe(0);
    expect(getYearInReview({ year: '2023', timeZone: 'Asia/Jerusalem' }, db).totals.messages).toBe(1);
  });

  it('surfaces the words and emoji of that year only', () => {
    db = createEmptyDb();
    seed(db, 'a@s.whatsapp.net', 'A', [
      { ts: utc(2023, 1, 5), text: 'renovation started 🏠' },
      { ts: utc(2023, 8, 5), text: 'renovation finally done 🏠🎉' },
      { ts: utc(2022, 8, 5), text: 'wedding wedding wedding 💍' },
    ]);

    const review = getYearInReview({ year: '2023' }, db);

    expect(review.topWords[0]).toEqual({ text: 'renovation', value: 2 });
    expect(review.topWords.map((w) => w.text)).not.toContain('wedding');
    expect(review.topEmojis[0]).toEqual({ emoji: '🏠', count: 2 });
  });
});

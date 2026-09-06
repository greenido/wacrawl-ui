import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDormancy } from '../routes/stats.js';
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

/**
 * Spread `count` messages evenly across [daysAgoFrom, daysAgoTo), newest first,
 * so a window boundary never lands ambiguously on a single timestamp.
 */
function seed(
  database: Database.Database,
  jid: string,
  kind: 'direct' | 'group',
  spans: Array<{ daysAgoFrom: number; daysAgoTo: number; count: number }>,
): void {
  database
    .prepare('INSERT OR IGNORE INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run(jid, kind, jid.split('@')[0], null);

  const insert = database.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, ?, ?, NULL, NULL, ?, 1, 'msg', 0, 'text', NULL, NULL, NULL)
  `);

  let pk = (database.prepare('SELECT COALESCE(MAX(source_pk), 0) AS max FROM messages').get() as { max: number }).max;
  for (const span of spans) {
    const width = span.daysAgoFrom - span.daysAgoTo;
    for (let i = 0; i < span.count; i += 1) {
      const daysAgo = span.daysAgoTo + (width * (i + 0.5)) / span.count;
      pk += 1;
      insert.run(pk, jid, jid, `${jid}-${pk}`, NOW_TS - Math.round(daysAgo * DAY));
    }
  }
}

const OPTIONS = { baselineDays: '730', recentDays: '90', minBaselineMessages: '20' };

describe('getDormancy', () => {
  it('ranks the biggest per-month drop first', () => {
    db = createEmptyDb();
    // Was 200 over the baseline, now silent.
    seed(db, 'gone@s.whatsapp.net', 'direct', [{ daysAgoFrom: 700, daysAgoTo: 100, count: 200 }]);
    // Was 200, now down to a trickle.
    seed(db, 'fading@s.whatsapp.net', 'direct', [
      { daysAgoFrom: 700, daysAgoTo: 100, count: 200 },
      { daysAgoFrom: 89, daysAgoTo: 0, count: 8 },
    ]);

    const { contacts } = getDormancy(OPTIONS, db);

    expect(contacts.map((c) => c.jid)).toEqual(['gone@s.whatsapp.net', 'fading@s.whatsapp.net']);
    expect(contacts[0].dropRatio).toBe(1);
    expect(contacts[0].recentCount).toBe(0);
    expect(contacts[1].dropRatio).toBeGreaterThan(0);
    expect(contacts[1].dropRatio).toBeLessThan(1);
  });

  it('leaves out chats that held steady or grew', () => {
    db = createEmptyDb();
    seed(db, 'steady@s.whatsapp.net', 'direct', [
      { daysAgoFrom: 700, daysAgoTo: 100, count: 200 },
      // 30/month over 3 months matches the baseline rate of 30/month.
      { daysAgoFrom: 89, daysAgoTo: 0, count: 90 },
    ]);
    seed(db, 'growing@s.whatsapp.net', 'direct', [
      { daysAgoFrom: 700, daysAgoTo: 100, count: 40 },
      { daysAgoFrom: 89, daysAgoTo: 0, count: 200 },
    ]);

    expect(getDormancy(OPTIONS, db).contacts).toEqual([]);
  });

  it('ignores contacts who were never a real habit', () => {
    db = createEmptyDb();
    // Five messages two years ago and nothing since is not a lapsed friendship.
    seed(db, 'acquaintance@s.whatsapp.net', 'direct', [{ daysAgoFrom: 700, daysAgoTo: 600, count: 5 }]);
    seed(db, 'real@s.whatsapp.net', 'direct', [{ daysAgoFrom: 700, daysAgoTo: 100, count: 60 }]);

    expect(getDormancy(OPTIONS, db).contacts.map((c) => c.jid)).toEqual(['real@s.whatsapp.net']);
  });

  it('compares rates rather than raw counts when the windows differ in length', () => {
    db = createEmptyDb();
    // 120 messages over 90 days is a higher rate than 120 over the 640-day
    // baseline, so this chat is busier now even though the totals match.
    seed(db, 'busier@s.whatsapp.net', 'direct', [
      { daysAgoFrom: 700, daysAgoTo: 100, count: 120 },
      { daysAgoFrom: 89, daysAgoTo: 0, count: 120 },
    ]);

    expect(getDormancy(OPTIONS, db).contacts).toEqual([]);
  });

  it('reports how long the silence has lasted', () => {
    db = createEmptyDb();
    seed(db, 'quiet@s.whatsapp.net', 'direct', [{ daysAgoFrom: 700, daysAgoTo: 200, count: 60 }]);

    const [contact] = getDormancy(OPTIONS, db).contacts;

    expect(contact.daysSinceLastMessage).toBeGreaterThanOrEqual(200);
    expect(contact.lastMessageAt).toMatch(/^20\d\d-/);
  });

  it('looks at direct chats by default and groups only when asked', () => {
    db = createEmptyDb();
    seed(db, 'team@g.us', 'group', [{ daysAgoFrom: 700, daysAgoTo: 100, count: 200 }]);
    seed(db, 'friend@s.whatsapp.net', 'direct', [{ daysAgoFrom: 700, daysAgoTo: 100, count: 60 }]);

    expect(getDormancy(OPTIONS, db).contacts.map((c) => c.jid)).toEqual(['friend@s.whatsapp.net']);
    expect(getDormancy({ ...OPTIONS, kind: 'group' }, db).contacts.map((c) => c.jid)).toEqual(['team@g.us']);
    expect(getDormancy({ ...OPTIONS, kind: 'all' }, db).contacts).toHaveLength(2);
  });

  it("treats a chat labelled 'dm' as direct", () => {
    db = createEmptyDb();
    // Real archives use 'dm' where the fixtures say 'direct'. Matching kind
    // exactly against 'direct' silently returned nothing for every real DM.
    seed(db, 'dm@s.whatsapp.net', 'dm' as 'direct', [{ daysAgoFrom: 700, daysAgoTo: 100, count: 60 }]);

    expect(getDormancy(OPTIONS, db).contacts.map((c) => c.jid)).toEqual(['dm@s.whatsapp.net']);
    expect(getDormancy({ ...OPTIONS, kind: 'group' }, db).contacts).toEqual([]);
  });

  it('keeps the recent window inside the baseline window', () => {
    db = createEmptyDb();
    seed(db, 'someone@s.whatsapp.net', 'direct', [{ daysAgoFrom: 700, daysAgoTo: 100, count: 60 }]);

    // A baseline shorter than the recent window would make the baseline
    // negative-length; it is clamped instead of producing nonsense rates.
    const report = getDormancy({ baselineDays: '30', recentDays: '90', minBaselineMessages: '1' }, db);

    expect(report.baselineDays).toBe(91);
    expect(report.recentDays).toBe(90);
  });
});

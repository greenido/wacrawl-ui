import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { percentile } from '../lib/percentile.js';
import { getReplyLatency, getResponseTimes } from '../routes/stats.js';
import { createEmptyDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

const BASE_TS = 1_700_000_000;

interface Turn {
  /** Seconds after the previous message in the same chat. */
  after: number;
  fromMe: boolean;
}

/**
 * Build a chat as a strict alternation of turns, so every message after the
 * first is a reply and `after` is exactly the gap the report should see.
 */
function seedChat(database: Database.Database, jid: string, name: string, turns: Turn[]): void {
  database
    .prepare('INSERT OR IGNORE INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run(jid, jid.endsWith('@g.us') ? 'group' : 'direct', name, null);

  const insert = database.prepare(`
    INSERT INTO messages (
      source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
      from_me, text, raw_type, message_type, media_type, media_path, media_size
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'text', NULL, NULL, NULL)
  `);

  const nextPk = (database.prepare('SELECT COALESCE(MAX(source_pk), 0) AS max FROM messages').get() as { max: number }).max;
  let ts = BASE_TS;
  turns.forEach((turn, index) => {
    ts += turn.after;
    insert.run(
      nextPk + index + 1,
      jid,
      name,
      `${jid}-${index}`,
      turn.fromMe ? null : jid,
      turn.fromMe ? null : name,
      ts,
      turn.fromMe ? 1 : 0,
      'msg',
    );
  });
}

/** Alternating turns with the given gaps, starting with a message from them. */
function alternating(gaps: number[]): Turn[] {
  return [{ after: 0, fromMe: false }, ...gaps.map((after, i) => ({ after, fromMe: i % 2 === 0 }))];
}

describe('getResponseTimes', () => {
  it('is not dragged off by a single outlier the way the mean was', () => {
    db = createEmptyDb();
    // Eight near-instant replies, one slow, one that took a fortnight.
    seedChat(db, 'steady@s.whatsapp.net', 'Steady', alternating([30, 30, 30, 30, 30, 30, 30, 30, 3 * 3600, 14 * 86_400]));

    const [stat] = getResponseTimes({ period: 'all', minResponses: '1' }, db);

    expect(stat.responseCount).toBe(10);
    expect(stat.medianSeconds).toBe(30);
    expect(stat.p90Seconds).toBe(3 * 3600);
    // What this report used to publish: a "typical" reply time of a day and a
    // half for a chat where four replies in five arrive within the minute.
    expect(stat.averageSeconds).toBeGreaterThan(100_000);
  });

  it('drops chats with too few exchanges to mean anything', () => {
    db = createEmptyDb();
    seedChat(db, 'chatty@s.whatsapp.net', 'Chatty', alternating([600, 600, 600, 600, 600, 600]));
    // One lucky fast exchange used to win the whole leaderboard.
    seedChat(db, 'sparse@s.whatsapp.net', 'Sparse', alternating([1, 1]));

    const names = getResponseTimes({ period: 'all', minResponses: '5' }, db).map((s) => s.name);

    expect(names).toEqual(['Chatty']);
  });

  it('separates my turnaround from theirs', () => {
    db = createEmptyDb();
    // Alternating from them: odd gaps are mine, even gaps are theirs.
    seedChat(db, 'lopsided@s.whatsapp.net', 'Lopsided', alternating([10, 1000, 10, 1000, 10, 1000]));

    const [stat] = getResponseTimes({ period: 'all', minResponses: '1' }, db);

    expect(stat.myResponseCount).toBe(3);
    expect(stat.myMedianSeconds).toBe(10);
    expect(stat.theirResponseCount).toBe(3);
    expect(stat.theirMedianSeconds).toBe(1000);
  });

  it('ranks by median rather than by whoever had the single fastest reply', () => {
    db = createEmptyDb();
    seedChat(db, 'fast@s.whatsapp.net', 'Fast', alternating([20, 20, 20, 20, 20, 20]));
    seedChat(db, 'slow@s.whatsapp.net', 'Slow', alternating([1, 4000, 4000, 4000, 4000, 4000]));

    expect(getResponseTimes({ period: 'all', minResponses: '5' }, db).map((s) => s.name))
      .toEqual(['Fast', 'Slow']);
  });
});

describe('getReplyLatency', () => {
  it('places each gap in the bucket that contains it, by direction', () => {
    db = createEmptyDb();
    seedChat(db, 'mixed@s.whatsapp.net', 'Mixed', alternating([
      30,        // mine   -> < 1 min
      120,       // theirs -> 1–5 min
      30,        // mine   -> < 1 min
      2 * 3600,  // theirs -> 1–4 h
      4 * 86_400, // mine  -> 3 d +
    ]));

    const { buckets, mine, theirs } = getReplyLatency({ period: 'all' }, db);
    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b]));

    expect(byLabel['< 1 min']).toMatchObject({ mine: 2, theirs: 0 });
    expect(byLabel['1–5 min']).toMatchObject({ mine: 0, theirs: 1 });
    expect(byLabel['1–4 h']).toMatchObject({ mine: 0, theirs: 1 });
    expect(byLabel['3 d +']).toMatchObject({ mine: 1, theirs: 0 });

    expect(mine.count).toBe(3);
    expect(mine.medianSeconds).toBe(30);
    expect(theirs.count).toBe(2);
  });

  it('keeps every bucket present so the chart has a stable x axis', () => {
    db = createEmptyDb();
    seedChat(db, 'quiet@s.whatsapp.net', 'Quiet', alternating([45]));

    const { buckets } = getReplyLatency({ period: 'all' }, db);

    expect(buckets).toHaveLength(9);
    expect(buckets[buckets.length - 1].toSeconds).toBeNull();
    expect(buckets.reduce((sum, b) => sum + b.mine + b.theirs, 0)).toBe(1);
  });

  it('reports full coverage when nothing was truncated', () => {
    db = createEmptyDb();
    seedChat(db, 'small@s.whatsapp.net', 'Small', alternating([60, 60]));

    expect(getReplyLatency({ period: 'all' }, db).scan).toMatchObject({ scanned: 2, truncated: false });
  });
});

describe('percentile', () => {
  it('uses nearest rank and clamps at the ends', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 90)).toBe(9);
    expect(percentile(sorted, 100)).toBe(10);
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile([], 50)).toBe(0);
  });
});

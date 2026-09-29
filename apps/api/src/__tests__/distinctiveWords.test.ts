import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getDistinctiveWords } from '../routes/stats.js';
import { createEmptyDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function seed(database: Database.Database, messages: Array<{ fromMe: boolean; text: string; times: number }>): void {
  const insert = database.prepare(`
    INSERT INTO messages (source_pk, chat_jid, msg_id, ts, from_me, text, raw_type)
    VALUES (?, 'alice@s.whatsapp.net', ?, ?, ?, ?, 0)
  `);
  let pk = 0;
  for (const message of messages) {
    for (let i = 0; i < message.times; i += 1) {
      pk += 1;
      insert.run(pk, `m${pk}`, 1_700_000_000 + pk, message.fromMe ? 1 : 0, message.text);
    }
  }
}

describe('getDistinctiveWords', () => {
  it('puts each side’s signature word on that side and leaves shared words out', () => {
    db = createEmptyDb();
    seed(db, [
      { fromMe: true, text: 'totally awesome plan', times: 30 },
      { fromMe: false, text: 'splendid dinner plan', times: 30 },
    ]);

    const words = getDistinctiveWords({ period: 'all' }, db);
    const mine = words.mine.map((term) => term.text);
    const theirs = words.theirs.map((term) => term.text);

    expect(mine).toEqual(expect.arrayContaining(['totally', 'awesome']));
    expect(theirs).toEqual(expect.arrayContaining(['splendid', 'dinner']));
    expect([...mine, ...theirs]).not.toContain('plan');
    expect(words.mine.every((term) => term.score > 0)).toBe(true);
    expect(words.theirs.every((term) => term.score < 0)).toBe(true);
  });

  it('does not let a word used a couple of times represent a side', () => {
    db = createEmptyDb();
    seed(db, [
      { fromMe: true, text: 'totally', times: 40 },
      { fromMe: true, text: 'quirky', times: 2 },
      { fromMe: false, text: 'splendid', times: 40 },
    ]);

    const mine = getDistinctiveWords({ period: 'all' }, db).mine.map((term) => term.text);

    expect(mine).toContain('totally');
    expect(mine).not.toContain('quirky');
  });

  it('skips stopwords and opaque tokens', () => {
    db = createEmptyDb();
    seed(db, [
      { fromMe: true, text: 'the the the 1234567 abc123def456ghi totally', times: 20 },
      { fromMe: false, text: 'splendid', times: 20 },
    ]);

    const mine = getDistinctiveWords({ period: 'all' }, db).mine.map((term) => term.text);

    expect(mine).toEqual(['totally']);
  });

  it('returns nothing when only one side has spoken', () => {
    db = createEmptyDb();
    seed(db, [{ fromMe: true, text: 'totally awesome', times: 20 }]);

    const words = getDistinctiveWords({ period: 'all' }, db);

    expect(words.mine).toEqual([]);
    expect(words.theirs).toEqual([]);
  });
});

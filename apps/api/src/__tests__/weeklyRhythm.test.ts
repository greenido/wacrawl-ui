import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getWeeklyRhythm } from '../routes/stats.js';
import { createEmptyDb, createTestDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function insertAt(database: Database.Database, pk: number, iso: string): void {
  database.prepare(`
    INSERT INTO messages (source_pk, chat_jid, msg_id, ts, from_me, text, raw_type)
    VALUES (?, 'alice@s.whatsapp.net', ?, ?, 1, 'hi', 0)
  `).run(pk, `m${pk}`, Math.floor(Date.parse(iso) / 1000));
}

describe('getWeeklyRhythm', () => {
  it('returns all 168 cells and accounts for every message', () => {
    db = createTestDb();
    const rhythm = getWeeklyRhythm({ period: 'all' }, db);

    expect(rhythm.cells).toHaveLength(168);
    expect(rhythm.total).toBe(6);
    expect(rhythm.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(6);
  });

  it('files messages under weekday and hour, and names the peak', () => {
    db = createEmptyDb();
    // 2024-06-02 is a Sunday.
    insertAt(db, 1, '2024-06-02T22:10:00Z');
    insertAt(db, 2, '2024-06-02T22:40:00Z');
    insertAt(db, 3, '2024-06-04T09:00:00Z');

    const rhythm = getWeeklyRhythm({ period: 'all', timeZone: 'UTC' }, db);

    expect(rhythm.peak).toEqual({ day: 0, hour: 22, count: 2 });
    expect(rhythm.cells.find((cell) => cell.day === 2 && cell.hour === 9)?.count).toBe(1);
  });

  it('moves a late-night UTC message onto the viewer’s next day', () => {
    db = createEmptyDb();
    // Sunday 22:10 UTC is Monday 01:10 in Jerusalem (UTC+3 in June).
    insertAt(db, 1, '2024-06-02T22:10:00Z');

    const rhythm = getWeeklyRhythm({ period: 'all', timeZone: 'Asia/Jerusalem' }, db);

    expect(rhythm.peak).toEqual({ day: 1, hour: 1, count: 1 });
  });

  it('has no peak for an empty archive', () => {
    db = createEmptyDb();
    const rhythm = getWeeklyRhythm({ period: 'all' }, db);

    expect(rhythm.peak).toBeNull();
    expect(rhythm.total).toBe(0);
  });
});

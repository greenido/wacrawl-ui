import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGroupLifecycle } from '../routes/stats.js';
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

function group(
  database: Database.Database,
  jid: string,
  opts: { createdDaysAgo?: number; messageDaysAgo?: number[]; lastMessageDaysAgo?: number },
): void {
  database.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)')
    .run(jid, 'group', jid.split('@')[0], opts.lastMessageDaysAgo == null ? null : NOW_TS - opts.lastMessageDaysAgo * DAY);
  database.prepare('INSERT INTO groups (jid, name, created_at) VALUES (?, ?, ?)')
    .run(jid, jid.split('@')[0], opts.createdDaysAgo == null ? null : NOW_TS - opts.createdDaysAgo * DAY);

  const insert = database.prepare(`
    INSERT INTO messages (source_pk, chat_jid, msg_id, ts, from_me, text, raw_type)
    VALUES (?, ?, ?, ?, 0, 'hi', 0)
  `);
  let pk = (database.prepare('SELECT COALESCE(MAX(source_pk), 0) AS max FROM messages').get() as { max: number }).max;
  for (const daysAgo of opts.messageDaysAgo ?? []) {
    pk += 1;
    insert.run(pk, jid, `${jid}-${pk}`, NOW_TS - daysAgo * DAY);
  }
}

describe('getGroupLifecycle', () => {
  it('splits alive from dead at the dormancy line and ranks the loudest graves first', () => {
    db = createEmptyDb();
    group(db, 'alive@g.us', { createdDaysAgo: 400, messageDaysAgo: [10, 20] });
    group(db, 'small-grave@g.us', { createdDaysAgo: 1000, messageDaysAgo: [300] });
    group(db, 'big-grave@g.us', { createdDaysAgo: 2000, messageDaysAgo: [400, 401, 402] });
    group(db, 'never@g.us', { createdDaysAgo: 50 });

    const report = getGroupLifecycle({ dormantDays: '180' }, db);

    expect(report.totalGroups).toBe(4);
    expect(report.deadGroups).toBe(3);
    expect(report.neverActiveGroups).toBe(1);
    expect(report.graveyard.map((entry) => entry.jid)).toEqual(['big-grave@g.us', 'small-grave@g.us']);
    expect(report.graveyard[0].daysSilent).toBe(400);
    expect(report.oldestAlive?.jid).toBe('alive@g.us');
    expect(report.medianAgeDays).toBe(400);
  });

  it('trusts a newer last_message_at over a partial message history', () => {
    db = createEmptyDb();
    group(db, 'partial@g.us', { createdDaysAgo: 900, messageDaysAgo: [500], lastMessageDaysAgo: 3 });

    const report = getGroupLifecycle({}, db);

    expect(report.deadGroups).toBe(0);
    expect(report.oldestAlive?.jid).toBe('partial@g.us');
  });

  it('counts founding years split by whether the group survived', () => {
    db = createEmptyDb();
    group(db, 'a@g.us', { createdDaysAgo: 365 * 3, messageDaysAgo: [5] });
    group(db, 'b@g.us', { createdDaysAgo: 365 * 3 + 10, messageDaysAgo: [800] });
    group(db, 'c@g.us', { messageDaysAgo: [5] });

    const { foundedByYear } = getGroupLifecycle({ timeZone: 'UTC' }, db);

    expect(foundedByYear).toEqual([{ year: 2021, alive: 1, dead: 1 }]);
  });
});

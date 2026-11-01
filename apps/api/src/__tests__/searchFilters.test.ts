import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchFilterError } from '../lib/searchFilters.js';
import { createSearchIndexes } from '../lib/searchIndex.js';
import { getChats, getPeople, searchMessages } from '../routes/data.js';
import { getGroupDirectory } from '../routes/stats/profiles.js';
import {
  getActivityHeatmap,
  getDayOfWeekStats,
  getHourOfDayStats,
  getMediaBreakdown,
  getMediaSenders,
  getTopContacts,
} from '../routes/stats.js';
import { createTestDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function msgIds(params: Parameters<typeof searchMessages>[0]): string[] {
  return searchMessages({ limit: '100', ...params }, db!).data.map((message) => message.msgId).sort();
}

/** Tokyo keeps one offset all year, so these hold whichever date the suite runs. */
const TOKYO = 'Asia/Tokyo';

describe('searchMessages filters', () => {
  it('answers a filter with no text, newest first', () => {
    db = createTestDb();

    const results = searchMessages({ chat: 'family@g.us' }, db);

    expect(results.data.map((message) => message.msgId)).toEqual(['m5', 'm4', 'm3']);
    expect(results.pagination.total).toBe(3);
  });

  it('still needs two characters when nothing else narrows the search', () => {
    db = createTestDb();

    expect(searchMessages({ q: 'h' }, db).pagination.total).toBe(0);
    expect(searchMessages({}, db).pagination.total).toBe(0);
    expect(msgIds({ q: 'h', chat: 'alice@s.whatsapp.net' })).toEqual(['m1', 'm2', 'm6']);
  });

  it('does not pass a chat name off as the text of a caption-less message', () => {
    db = createTestDb();
    db.prepare('UPDATE messages SET text = NULL WHERE msg_id = ?').run('m5');

    expect(searchMessages({ chat: 'family@g.us' }, db).data[0]).toMatchObject({ msgId: 'm5', snippet: '' });
  });

  it('filters by who wrote the message, including you', () => {
    db = createTestDb();

    expect(msgIds({ sender: 'bob@s.whatsapp.net' })).toEqual(['m3']);
    expect(msgIds({ sender: 'me' })).toEqual(['m1', 'm4', 'm6']);
    expect(msgIds({ sender: 'me', chat: 'family@g.us' })).toEqual(['m4']);
  });

  it('treats a phone JID and its LID as one sender', () => {
    db = createTestDb();
    db.prepare('UPDATE contacts SET lid = ? WHERE jid = ?').run('200000000000001@lid', 'bob@s.whatsapp.net');
    db.prepare('UPDATE messages SET sender_jid = ? WHERE msg_id = ?').run('200000000000001@lid', 'm5');

    expect(msgIds({ sender: 'bob@s.whatsapp.net' })).toEqual(['m3', 'm5']);
    expect(msgIds({ sender: '200000000000001@lid' })).toEqual(['m3', 'm5']);
  });

  it('filters by media type, or by having any media at all', () => {
    db = createTestDb();
    // Real archives store "no media" as an empty string rather than NULL.
    db.prepare("UPDATE messages SET media_type = '' WHERE msg_id = ?").run('m1');

    expect(msgIds({ mediaType: 'image' })).toEqual(['m2']);
    expect(msgIds({ mediaType: 'any' })).toEqual(['m2', 'm5']);
  });

  it('reads date bounds in the viewer calendar', () => {
    db = createTestDb();

    // m1 is 22:13 UTC on the 14th, which is already the 15th in Tokyo.
    expect(msgIds({ from: '2023-11-14', to: '2023-11-14' })).toEqual(['m1']);
    expect(msgIds({ from: '2023-11-14', to: '2023-11-14', timeZone: TOKYO })).toEqual([]);
    expect(msgIds({ from: '2023-11-15', to: '2023-11-15', timeZone: TOKYO })).toEqual(['m1']);
    expect(msgIds({ from: '2023-11-19', timeZone: TOKYO })).toEqual(['m5', 'm6']);
    expect(msgIds({ to: '2023-11-15', timeZone: TOKYO })).toEqual(['m1']);
  });

  it('reads hour and weekday in the viewer calendar', () => {
    db = createTestDb();

    expect(msgIds({ hour: '22' })).toHaveLength(6);
    expect(msgIds({ hour: '22', timeZone: TOKYO })).toEqual([]);
    expect(msgIds({ hour: '7', timeZone: TOKYO })).toHaveLength(6);
    // Tuesday the 14th in UTC, Wednesday the 15th in Tokyo.
    expect(msgIds({ weekday: '2' })).toEqual(['m1']);
    expect(msgIds({ weekday: '3', timeZone: TOKYO })).toEqual(['m1']);
    expect(msgIds({ weekday: '2', timeZone: TOKYO })).toEqual([]);
  });

  it('applies the dashboard period as a rolling window', () => {
    db = createTestDb();
    const insertMessage = db.prepare(`
      INSERT INTO messages (source_pk, chat_jid, msg_id, sender_jid, ts, from_me, text, raw_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);
    insertMessage.run(7, 'family@g.us', 'recent', 'bob@s.whatsapp.net', Math.floor(Date.now() / 1000) - 3600, 0, 'just now');

    expect(msgIds({ period: 'week' })).toEqual(['recent']);
    expect(msgIds({ period: 'all', chat: 'family@g.us' })).toEqual(['m3', 'm4', 'm5', 'recent']);
  });

  it('combines filters with text, on the LIKE path', () => {
    db = createTestDb();

    expect(msgIds({ q: 'family', sender: 'me' })).toEqual(['m4']);
    expect(searchMessages({ q: 'family', sender: 'me' }, db).pagination.total).toBe(1);
  });

  it('combines filters with text, on the FTS path', () => {
    db = createTestDb();
    createSearchIndexes(db);

    expect(msgIds({ q: 'family', sender: 'me' })).toEqual(['m4']);
    expect(searchMessages({ q: 'family', sender: 'me' }, db).pagination.total).toBe(1);
    expect(msgIds({ q: 'family', hour: '7', timeZone: TOKYO })).toEqual(['m3', 'm4', 'm5']);
  });

  it('pages through filtered results', () => {
    db = createTestDb();

    const page = searchMessages({ sender: 'me', limit: '2', offset: '2' }, db);

    expect(page.data.map((message) => message.msgId)).toEqual(['m1']);
    expect(page.pagination).toEqual({ limit: 2, offset: 2, total: 3 });
  });

  it.each([
    [{ from: 'yesterday' }, /from/],
    [{ from: '2023-02-30' }, /from/],
    [{ to: '2023-13-01' }, /to/],
    [{ from: '2023-11-02', to: '2023-11-01' }, /after/],
    [{ hour: '24' }, /hour/],
    [{ hour: '-1' }, /hour/],
    [{ hour: '1.5' }, /hour/],
    [{ weekday: '7' }, /weekday/],
    [{ period: 'fortnight' }, /period/],
    [{ chat: 'x'.repeat(300) }, /chat/],
  ])('rejects %j', (params, message) => {
    db = createTestDb();

    expect(() => searchMessages(params, db!)).toThrow(SearchFilterError);
    expect(() => searchMessages(params, db!)).toThrow(message);
  });

  it('falls back to UTC for an unusable timezone, like the stats routes', () => {
    db = createTestDb();

    expect(msgIds({ hour: '22', timeZone: 'Mars/Olympus_Mons' })).toHaveLength(6);
  });
});

/**
 * The point of a drill-down: the number on the chart and the number of messages
 * behind it are the same number. Each fixture message is run through both.
 */
describe('drill-downs match the reports they start from', () => {
  function total(params: Parameters<typeof searchMessages>[0]): number {
    return searchMessages({ ...params, limit: '1' }, db!).pagination.total;
  }

  function seedLidSender(): void {
    db!.prepare('UPDATE contacts SET lid = ? WHERE jid = ?').run('200000000000001@lid', 'carol@s.whatsapp.net');
    db!.prepare('UPDATE messages SET sender_jid = ? WHERE msg_id = ?').run('200000000000001@lid', 'm5');
  }

  it.each(['UTC', TOKYO])('heatmap days in %s', (timeZone) => {
    db = createTestDb();

    const days = getActivityHeatmap({ year: 2023, timeZone }, db);

    expect(days.length).toBeGreaterThan(0);
    for (const { date, count } of days) {
      expect(total({ from: date, to: date, timeZone })).toBe(count);
    }
  });

  it.each(['UTC', TOKYO])('hours of day in %s', (timeZone) => {
    db = createTestDb();

    const hours = getHourOfDayStats({ period: 'all', timeZone }, db);

    expect(hours.length).toBeGreaterThan(0);
    for (const { hour, count } of hours) {
      expect(total({ hour: String(hour), timeZone })).toBe(count);
    }
  });

  it.each(['UTC', TOKYO])('days of week in %s', (timeZone) => {
    db = createTestDb();

    for (const { day, count } of getDayOfWeekStats({ period: 'all', timeZone }, db)) {
      expect(total({ weekday: String(day), timeZone })).toBe(count);
    }
  });

  it('top contacts, counting both directions and both JID spellings', () => {
    db = createTestDb();
    seedLidSender();

    const contacts = getTopContacts({ period: 'all' }, db);

    expect(contacts.length).toBeGreaterThan(1);
    for (const { jid, messageCount } of contacts) {
      expect(total({ contact: jid, period: 'all' })).toBe(messageCount);
    }
  });

  it('media breakdown rows', () => {
    db = createTestDb();

    for (const { mediaType, count } of getMediaBreakdown({ period: 'all' }, db)) {
      expect(total({ mediaType, period: 'all' })).toBe(count);
    }
  });

  it('media senders', () => {
    db = createTestDb();
    seedLidSender();

    const senders = getMediaSenders({ period: 'all' }, db);

    expect(senders.length).toBeGreaterThan(0);
    for (const { jid, mediaCount } of senders) {
      expect(total({ contact: jid, mediaType: 'any', period: 'all' })).toBe(mediaCount);
    }
  });
});

describe('list name filters', () => {
  it('filters chats by name and pages the matches', () => {
    db = createTestDb();

    const chats = getChats({ q: 'family' }, db);

    expect(chats.data.map((chat) => chat.jid)).toEqual(['family@g.us']);
    expect(chats.pagination.total).toBe(1);
    expect(getChats({ q: 'no such chat' }, db).pagination.total).toBe(0);
  });

  it('finds a chat through its contact name, or through messages when the chat has no name', () => {
    db = createTestDb();
    db.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)').run('team@g.us', 'group', null, 1_700_000_000);
    db.prepare(`
      INSERT INTO messages (source_pk, chat_jid, chat_name, msg_id, ts, from_me, raw_type)
      VALUES (50, 'team@g.us', 'Launch Team', 'm50', 1700000000, 1, 0)
    `).run();

    // The chat is called "Alice"; "Example" only appears on the contact.
    expect(getChats({ q: 'example' }, db).data.map((chat) => chat.jid)).toEqual(['alice@s.whatsapp.net']);
    expect(getChats({ q: 'launch' }, db).data.map((chat) => chat.jid)).toEqual(['team@g.us']);
  });

  it('combines the chat name filter with kind', () => {
    db = createTestDb();

    expect(getChats({ q: 'a', kind: 'group' }, db).data.map((chat) => chat.jid)).toEqual(['family@g.us']);
    expect(getChats({ q: 'family', kind: 'direct' }, db).pagination.total).toBe(0);
  });

  it('treats LIKE wildcards in a name filter as literal text', () => {
    db = createTestDb();

    expect(getChats({ q: '%' }, db).pagination.total).toBe(0);
    expect(getPeople({ q: '_' }, db).pagination.total).toBe(0);
  });

  it('filters people by any name they go by', () => {
    db = createTestDb();

    // Shown as "Bob", because a message carries that name; "Builder" is only on the contact.
    const bob = getPeople({ q: 'builder' }, db);

    expect(bob.data.map((person) => person.jid)).toEqual(['bob@s.whatsapp.net']);
    expect(bob.data[0]).toMatchObject({ name: 'Bob', messageCount: 1 });
    expect(bob.pagination.total).toBe(1);
    expect(getPeople({ q: 'nobody at all' }, db).pagination.total).toBe(0);
  });

  it('looks one person up by JID', () => {
    db = createTestDb();

    const people = getPeople({ jid: 'carol@s.whatsapp.net' }, db);

    expect(people.data.map((person) => person.name)).toEqual(['Carol']);
    expect(people.pagination.total).toBe(1);
  });

  it('filters the group directory by name', () => {
    db = createTestDb();
    db.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)').run('team@g.us', 'group', 'Launch Team', 1_700_000_000);

    expect(getGroupDirectory({ q: 'launch' }, db).map((group) => group.jid)).toEqual(['team@g.us']);
    expect(getGroupDirectory({ q: 'nothing like it' }, db)).toEqual([]);
    expect(getGroupDirectory({}, db)).toHaveLength(2);
  });
});

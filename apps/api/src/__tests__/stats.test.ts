import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { sinceTimestamp, unixSecondsToIso } from '../lib/query.js';
import {
  getActivityHeatmap,
  getDayOfWeekStats,
  getGroupActivity,
  getHourOfDayStats,
  getMediaBreakdown,
  getMediaSenders,
  getMessageStreaks,
  getMessageVolume,
  getOverviewStats,
  getResponseTimes,
  getSentReceivedRatio,
  getTopContacts,
  getWordCloud,
} from '../routes/stats.js';
import { createTestDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe('stats queries', () => {
  it('returns overview counts and ISO date bounds', () => {
    db = createTestDb();
    const stats = getOverviewStats(db);

    expect(stats).toEqual({
      totalMessages: 6,
      totalChats: 3,
      totalContacts: 4,
      totalMediaFiles: 2,
      oldestMessage: '2023-11-14T22:13:20.000Z',
      newestMessage: '2023-11-19T22:13:20.000Z',
    });
  });

  it('groups top contacts by counterparty jid', () => {
    db = createTestDb();
    const contacts = getTopContacts({ period: 'all', limit: '5' }, db);

    expect(contacts[0]).toMatchObject({
      jid: 'alice@s.whatsapp.net',
      name: 'Alice',
      phone: null,
      messageCount: 3,
      sentByMe: 2,
      sentByThem: 1,
    });
  });

  it('includes contact phone in top contacts when present', () => {
    db = createTestDb();
    db.prepare('UPDATE contacts SET phone = ? WHERE jid = ?').run('+15551234567', 'alice@s.whatsapp.net');
    const contacts = getTopContacts({ period: 'all', limit: '5' }, db);
    expect(contacts.find((c) => c.jid === 'alice@s.whatsapp.net')?.phone).toBe('+15551234567');
  });

  it('falls back to contact or chat names when sender names are encoded placeholders', () => {
    db = createTestDb();
    const insertMessage = db.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMessage.run(7, 'charlie@s.whatsapp.net', 'Charlie Chat', 'm7', 'charlie@s.whatsapp.net', 'IAA=', 1_700_518_400, 0, 'hi', 0, 'text', null, null, null);
    insertMessage.run(8, 'family@g.us', 'Family Group', 'm8', 'dave@s.whatsapp.net', 'IAA=', 1_700_604_800, 0, 'group hi', 0, 'text', null, null, null);
    insertMessage.run(9, 'eve@s.whatsapp.net', 'Eve Chat', 'm9', 'eve@s.whatsapp.net', 'CMznlMkGIABAqLTKyqszSAF4xL3KyqszkAEA8AEC', 1_700_691_200, 0, 'encoded hi', 0, 'text', null, null, null);

    const contacts = getTopContacts({ period: 'all', limit: '10' }, db);

    expect(contacts.find((contact) => contact.jid === 'charlie@s.whatsapp.net')?.name).toBe('Charlie Chat');
    expect(contacts.find((contact) => contact.jid === 'dave@s.whatsapp.net')?.name).toBe('Dave Contact');
    expect(contacts.find((contact) => contact.jid === 'eve@s.whatsapp.net')?.name).toBe('Eve Chat');
  });

  it('resolves LID stats through chat and contact display names', () => {
    db = createTestDb();
    db.prepare('INSERT INTO chats (jid, kind, name, last_message_at) VALUES (?, ?, ?, ?)').run('89760605454342@lid', 'direct', 'Niv', 1_700_604_800);
    db.prepare('INSERT INTO contacts (jid, full_name, first_name, lid) VALUES (?, ?, ?, ?)').run('972533351664@s.whatsapp.net', 'Eynan Tzabar', 'Eynan', '272528660545772@lid');
    const insertMessage = db.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMessage.run(7, '89760605454342@lid', '89760605454342@lid', 'm7', null, null, 1_700_518_400, 1, 'lid direct', 0, 'text', null, null, null);
    insertMessage.run(8, 'family@g.us', 'Family', 'm8', '272528660545772@lid', 'IAA=', 1_700_604_800, 0, 'lid group', 0, 'image', 'image', '/tmp/lid.jpg', 25);

    expect(getTopContacts({ period: 'all', limit: '10' }, db).find((contact) => contact.jid === '89760605454342@lid')?.name).toBe('Niv');
    expect(getTopContacts({ period: 'all', limit: '10' }, db).find((contact) => contact.jid === '272528660545772@lid')?.name).toBe('Eynan Tzabar');
    expect(getMediaSenders({ period: 'all', limit: '10' }, db).find((sender) => sender.jid === '272528660545772@lid')?.name).toBe('Eynan Tzabar');
  });

  it('buckets message volume by day', () => {
    db = createTestDb();
    const volume = getMessageVolume({ period: 'all', granularity: 'day' }, db);

    expect(volume).toEqual([
      { date: '2023-11-14', sent: 1, received: 0 },
      { date: '2023-11-15', sent: 0, received: 1 },
      { date: '2023-11-16', sent: 0, received: 1 },
      { date: '2023-11-17', sent: 1, received: 0 },
      { date: '2023-11-18', sent: 0, received: 1 },
      { date: '2023-11-19', sent: 1, received: 0 },
    ]);
  });

  it('returns activity heatmap points for the requested year', () => {
    db = createTestDb();
    const points = getActivityHeatmap({ year: '2023' }, db);

    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ date: '2023-11-14', count: 1 });
  });

  it('returns activity distributions and media aggregates', () => {
    db = createTestDb();

    expect(getHourOfDayStats({ period: 'all' }, db)[0]).toEqual({ hour: 22, count: 6 });
    expect(getHourOfDayStats({ period: 'all', timeZone: 'America/Los_Angeles' }, db)[0]).toEqual({ hour: 14, count: 6 });
    expect(getDayOfWeekStats({ period: 'all' }, db).find((point) => point.day === 2)).toMatchObject({ day: 2, label: 'Tue', count: 1 });
    expect(getMediaBreakdown({ period: 'all' }, db)).toEqual([
      { mediaType: 'audio', count: 1, totalBytes: 50 },
      { mediaType: 'image', count: 1, totalBytes: 100 },
    ]);
    expect(getMediaSenders({ period: 'all', limit: '2' }, db)[0]).toMatchObject({
      jid: 'alice@s.whatsapp.net',
      name: 'Alice',
      mediaCount: 1,
    });
  });

  it('returns ratio, response, group, streak, and word-cloud stats', () => {
    db = createTestDb();

    expect(getSentReceivedRatio({ period: 'all' }, db)).toEqual([
      { month: '2023-11-01', sent: 3, received: 3, ratio: 1 },
    ]);
    expect(getResponseTimes({ period: 'all', limit: '5' }, db)).toHaveLength(2);
    expect(getGroupActivity({ period: 'all', limit: '5' }, db)[0]).toMatchObject({
      jid: 'family@g.us',
      name: 'Family Group',
      messageCount: 3,
      participantCount: 2,
    });
    expect(getMessageStreaks({ period: 'all' }, db)).toEqual({ currentStreak: 0, longestStreak: 6 });
    expect(getWordCloud({ period: 'all', limit: '3' }, db)[0]).toMatchObject({ text: 'family', value: 2 });
  });
});

describe('query helpers', () => {
  it('treats WaCrawl timestamps as Unix seconds for the current schema', () => {
    expect(unixSecondsToIso(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z');
  });

  it('computes period cutoffs in Unix seconds', () => {
    expect(sinceTimestamp('day', 1_700_086_400_000)).toBe(1_700_000_000);
  });
});

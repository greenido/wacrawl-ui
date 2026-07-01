import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { sinceTimestamp, unixSecondsToIso } from '../lib/query.js';
import {
  getActivityHeatmap,
  getConversationDynamics,
  getDayOfWeekStats,
  getGroupActivity,
  getHourOfDayStats,
  getLinkIntelligence,
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
    expect(getTopContacts({ period: 'all', limit: '10' }, db).find((contact) => contact.jid === '972533351664@s.whatsapp.net')?.name).toBe('Eynan Tzabar');
    expect(getMediaSenders({ period: 'all', limit: '10' }, db).find((sender) => sender.jid === '272528660545772@lid')?.name).toBe('Eynan Tzabar');
  });

  it('merges top contacts that share the same contacts row (jid vs lid)', () => {
    db = createTestDb();
    db.prepare('INSERT INTO contacts (jid, full_name, first_name, lid) VALUES (?, ?, ?, ?)').run(
      'merge-test@s.whatsapp.net',
      'Merge Person',
      'Merge',
      '111222333444@lid',
    );
    const insertMessage = db.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMessage.run(70, 'family@g.us', 'Family', 'm70', '111222333444@lid', 'IAA=', 1_700_518_400, 0, 'from lid', 0, 'text', null, null, null);
    insertMessage.run(71, 'merge-test@s.whatsapp.net', 'Merge', 'm71', null, null, 1_700_604_800, 1, 'to phone jid', 0, 'text', null, null, null);

    const merged = getTopContacts({ period: 'all', limit: '20' }, db).find((c) => c.jid === 'merge-test@s.whatsapp.net');
    expect(merged).toMatchObject({ messageCount: 2, sentByMe: 1, sentByThem: 1 });
    expect(getTopContacts({ period: 'all', limit: '20' }, db).some((c) => c.jid === '111222333444@lid')).toBe(false);
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
    const allWords = getWordCloud({ period: 'all', limit: '200', filter: 'all' }, db).map((t) => t.text);
    const usefulWords = getWordCloud({ period: 'all', limit: '200', filter: 'useful' }, db).map((t) => t.text);
    expect(allWords.some((text) => text === 'hey')).toBe(true);
    expect(allWords.some((text) => text === 'the')).toBe(true);
    expect(usefulWords.some((text) => text === 'hey')).toBe(false);
    expect(usefulWords.some((text) => text === 'the')).toBe(false);
    expect(getWordCloud({ period: 'all', limit: '3' }, db)[0]).toMatchObject({ text: 'family', value: 2 });
  });
});

describe('conversation dynamics', () => {
  it('computes initiation ratio, depth, ghost score, trajectory, and late-night stats', () => {
    db = createTestDb();
    const insert = db.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const base = 1_700_000_000;
    // Session 1: starts at base (me), reply 30min later, reply 1h later
    insert.run(100, 'alice@s.whatsapp.net', 'Alice', 's1m1', null, null, base + 100, 1, 'start s1', 0, 'text', null, null, null);
    insert.run(101, 'alice@s.whatsapp.net', 'Alice', 's1m2', 'alice@s.whatsapp.net', 'Alice', base + 1800, 0, 'reply s1', 0, 'text', null, null, null);
    insert.run(102, 'alice@s.whatsapp.net', 'Alice', 's1m3', null, null, base + 3600, 1, 'followup s1', 0, 'text', null, null, null);
    // Session 2: gap >4h, starts with them
    insert.run(103, 'alice@s.whatsapp.net', 'Alice', 's2m1', 'alice@s.whatsapp.net', 'Alice', base + 20000, 0, 'start s2', 0, 'text', null, null, null);
    insert.run(104, 'alice@s.whatsapp.net', 'Alice', 's2m2', null, null, base + 21000, 1, 'reply s2', 0, 'text', null, null, null);
    // Session 3: another gap, me starts, no reply (ghost)
    insert.run(105, 'alice@s.whatsapp.net', 'Alice', 's3m1', null, null, base + 40000, 1, 'hello?', 0, 'text', null, null, null);
    // Session 4 (month 2): me starts, reply quick
    insert.run(106, 'alice@s.whatsapp.net', 'Alice', 's4m1', null, null, base + 2_700_000, 1, 'month2', 0, 'text', null, null, null);
    insert.run(107, 'alice@s.whatsapp.net', 'Alice', 's4m2', 'alice@s.whatsapp.net', 'Alice', base + 2_701_000, 0, 'month2 reply', 0, 'text', null, null, null);

    const dynamics = getConversationDynamics({ period: 'all', limit: '10' }, db);

    const alice = dynamics.initiationRatio.find((r) => r.jid === 'alice@s.whatsapp.net');
    expect(alice).toBeDefined();
    // Sessions (messages sorted by ts, >4h gap = new session):
    // S1 [m1, s1m1, s1m2, s1m3] me | S2 [s2m1, s2m2] them | S3 [s3m1] me
    // S4 [m2] them | S5 [m6] me | S6 [s4m1, s4m2] me
    expect(alice!.initiatedByMe).toBe(4);
    expect(alice!.initiatedByThem).toBe(2);

    expect(dynamics.conversationDepth.length).toBeGreaterThan(0);
    expect(dynamics.ghostScore.length).toBeGreaterThan(0);
    expect(dynamics.relationshipTrajectory.length).toBeGreaterThan(0);
    expect(dynamics.lateNightTexters.length).toBeGreaterThanOrEqual(0);
  });
});

describe('link intelligence', () => {
  it('extracts domains, categories, timeline, asymmetry, and first-shared from messages', () => {
    db = createTestDb();
    const insert = db.prepare(`
      INSERT INTO messages (
        source_pk, chat_jid, chat_name, msg_id, sender_jid, sender_name, ts,
        from_me, text, raw_type, message_type, media_type, media_path, media_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(20, 'alice@s.whatsapp.net', 'Alice', 'l1', null, null, 1_700_000_100, 1, 'check this https://youtube.com/watch?v=abc', 0, 'text', null, null, null);
    insert.run(21, 'alice@s.whatsapp.net', 'Alice', 'l2', 'alice@s.whatsapp.net', 'Alice', 1_700_086_500, 0, 'look https://reddit.com/r/test and https://youtube.com/watch?v=xyz', 0, 'text', null, null, null);
    insert.run(22, 'family@g.us', 'Family', 'l3', 'bob@s.whatsapp.net', 'Bob', 1_700_172_900, 0, 'news https://cnn.com/article/123', 0, 'text', null, null, null);
    insert.run(23, 'alice@s.whatsapp.net', 'Alice', 'l4', null, null, 1_700_259_300, 1, 'https://github.com/repo and https://amazon.com/product', 0, 'text', null, null, null);

    const result = getLinkIntelligence({ period: 'all', limit: '10' }, db);

    expect(result.totalLinks).toBe(6);
    expect(result.uniqueDomains).toBe(5);

    expect(result.domainLeaderboard[0]).toMatchObject({ domain: 'youtube.com', count: 2, category: 'video' });
    expect(result.domainLeaderboard.find((d) => d.domain === 'reddit.com')).toMatchObject({ category: 'social' });
    expect(result.domainLeaderboard.find((d) => d.domain === 'cnn.com')).toMatchObject({ category: 'news' });
    expect(result.domainLeaderboard.find((d) => d.domain === 'github.com')).toMatchObject({ category: 'dev' });
    expect(result.domainLeaderboard.find((d) => d.domain === 'amazon.com')).toMatchObject({ category: 'shopping' });

    expect(result.linkCategories.length).toBeGreaterThan(0);
    const videoCategory = result.linkCategories.find((c) => c.category === 'video');
    expect(videoCategory).toMatchObject({ count: 2, topDomain: 'youtube.com' });

    expect(result.mediaTimeline.length).toBeGreaterThan(0);

    const aliceAsymmetry = result.sharingAsymmetry.find((s) => s.jid === 'alice@s.whatsapp.net');
    expect(aliceAsymmetry).toBeDefined();
    expect(aliceAsymmetry!.linksSent).toBeGreaterThanOrEqual(3);
    expect(aliceAsymmetry!.linksReceived).toBeGreaterThanOrEqual(2);

    expect(result.firstShared.length).toBeGreaterThan(0);
    const aliceFirst = result.firstShared.find((f) => f.jid === 'alice@s.whatsapp.net');
    expect(aliceFirst).toBeDefined();
    expect(aliceFirst!.firstMessageText).toBe('hello project update');
  });

  it('returns empty results when no links exist', () => {
    db = createTestDb();
    db.exec("UPDATE messages SET text = 'plain text no urls'");
    const result = getLinkIntelligence({ period: 'all' }, db);

    expect(result.totalLinks).toBe(0);
    expect(result.uniqueDomains).toBe(0);
    expect(result.domainLeaderboard).toEqual([]);
    expect(result.linkCategories).toEqual([]);
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

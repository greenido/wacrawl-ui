import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateDemoArchive, type DemoArchive } from '../demo/demoArchive.js';
import { getGroupProfile, getGroupLifecycle, getContactProfile } from '../routes/stats/profiles.js';
import {
  getArchivedChats,
  getDistinctiveWords,
  getDormancy,
  getLinkIntelligence,
  getYearInReview,
} from '../routes/stats/reports.js';
import {
  getActivityHeatmap,
  getConversationDynamics,
  getDayOfWeekStats,
  getEmojiAnalytics,
  getGroupActivity,
  getHourOfDayStats,
  getMediaBreakdown,
  getMediaSenders,
  getMessageStreaks,
  getMessageVolume,
  getOverviewStats,
  getReplyLatency,
  getResponseTimes,
  getSentReceivedRatio,
  getTopContacts,
  getWeeklyRhythm,
  getWordCloud,
} from '../routes/stats.js';
import { getChats, getMediaItems, getPeople, searchMessages } from '../routes/data.js';
import { resolveSelfJids } from '../lib/selfIdentity.js';
import { resolveArchiveMediaPath } from '../lib/mediaFsPath.js';

const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

let tmpDir: string;
let archive: DemoArchive;
let db: Database.Database;

function fingerprint(dbPath: string): string {
  const source = new Database(dbPath, { readonly: true });
  const hash = createHash('sha256');
  for (const table of ['chats', 'contacts', 'groups', 'group_participants', 'messages', 'sync_state']) {
    hash.update(JSON.stringify(source.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()));
  }
  source.close();
  return hash.digest('hex');
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-demo-test-'));
  // Against the real clock, as `--demo` runs: the reports' windows end today.
  archive = generateDemoArchive({ dir: path.join(tmpDir, 'live') });
  db = new Database(archive.dbPath, { readonly: true });
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateDemoArchive', () => {
  it('produces the same archive from the same seed and date', () => {
    const first = generateDemoArchive({ dir: path.join(tmpDir, 'a'), seed: 7, now: FIXED_NOW });
    const second = generateDemoArchive({ dir: path.join(tmpDir, 'b'), seed: 7, now: FIXED_NOW });
    const other = generateDemoArchive({ dir: path.join(tmpDir, 'c'), seed: 8, now: FIXED_NOW });

    expect(fingerprint(first.dbPath)).toBe(fingerprint(second.dbPath));
    expect(fingerprint(first.dbPath)).not.toBe(fingerprint(other.dbPath));
  });

  it('never places a message after its own "now"', () => {
    const dated = generateDemoArchive({ dir: path.join(tmpDir, 'dated'), now: FIXED_NOW });
    const source = new Database(dated.dbPath, { readonly: true });
    const { newest } = source.prepare('SELECT MAX(ts) AS newest FROM messages').get() as { newest: number };
    source.close();

    expect(newest).toBeLessThanOrEqual(FIXED_NOW.getTime() / 1000);
  });

  it('only uses reserved numbers and invented identifiers', () => {
    const jids = db.prepare(`
      SELECT jid FROM contacts
      UNION SELECT user_jid FROM group_participants
      UNION SELECT jid FROM chats
      UNION SELECT sender_jid FROM messages WHERE sender_jid IS NOT NULL
    `).pluck().all() as string[];

    expect(jids.length).toBeGreaterThan(30);
    for (const jid of jids) {
      expect(jid).toMatch(/^(1555000\d{4}@s\.whatsapp\.net|9000000000\d{3}@lid|120363000000\d{3}@g\.us)$/);
    }
  });

  it('backs every media row with a real file', () => {
    const paths = db.prepare('SELECT DISTINCT media_path FROM messages WHERE media_path IS NOT NULL').pluck().all() as string[];

    expect(paths.length).toBeGreaterThan(10);
    for (const relative of paths) {
      expect(path.isAbsolute(relative)).toBe(false);
      expect(fs.existsSync(path.join(archive.mediaRoot, relative)), relative).toBe(true);
    }
    // And the way the server reads them, once told where the root is.
    process.env.WACRAWL_MEDIA_ROOT = archive.mediaRoot;
    process.env.WACRAWL_PATHS_FILE = path.join(tmpDir, 'no-such-paths.json');
    expect(fs.existsSync(resolveArchiveMediaPath(paths[0]))).toBe(true);
    delete process.env.WACRAWL_MEDIA_ROOT;
  });

  it('works out who the archive owner is', () => {
    expect([...resolveSelfJids(db)]).toEqual(['15550000000@s.whatsapp.net']);
  });
});

/** Each of these is a card on a page. An empty one would look broken in a demo. */
describe('demo archive fills every report', () => {
  const adaJid = () => (db.prepare("SELECT jid FROM contacts WHERE full_name = 'Ada Lovelace'").pluck().get() as string);
  const groupJid = (name: string) => (db.prepare('SELECT jid FROM chats WHERE name = ?').pluck().get(name) as string);

  it.each(['day', 'week', 'month', 'year', 'all'])('has activity in the %s window', (period) => {
    expect(getMessageVolume({ period }, db).length).toBeGreaterThan(0);
    expect(getTopContacts({ period }, db).length).toBeGreaterThan(0);
  });

  it('overview', () => {
    const overview = getOverviewStats(db);
    expect(overview.totalMessages).toBeGreaterThan(20_000);
    expect(overview.totalChats).toBeGreaterThan(30);
    expect(overview.totalContacts).toBeGreaterThan(40);
    expect(overview.totalMediaFiles).toBeGreaterThan(500);
  });

  it('activity charts', () => {
    const period = 'year';
    expect(getActivityHeatmap({ year: new Date().getFullYear() }, db).length).toBeGreaterThan(0);
    expect(getHourOfDayStats({ period }, db).filter((row) => row.count > 0).length).toBeGreaterThan(20);
    expect(getDayOfWeekStats({ period }, db).filter((row) => row.count > 0)).toHaveLength(7);
    expect(getSentReceivedRatio({ period }, db).length).toBeGreaterThan(6);
    expect(getWeeklyRhythm({ period }, db).total).toBeGreaterThan(0);
    expect(getMessageStreaks({ period }, db).currentStreak).toBeGreaterThan(30);
  });

  it('media and groups', () => {
    const period = 'year';
    expect(getMediaBreakdown({ period }, db).map((row) => row.mediaType).sort())
      .toEqual(['audio', 'document', 'image', 'sticker', 'video']);
    expect(getMediaSenders({ period }, db).length).toBeGreaterThan(5);
    expect(getGroupActivity({ period }, db).length).toBeGreaterThan(5);
    expect(getMediaItems({ limit: 10 }, db).data).toHaveLength(10);
  });

  it('reply times', () => {
    const period = 'year';
    expect(getResponseTimes({ period }, db).length).toBeGreaterThan(5);
    const latency = getReplyLatency({ period }, db);
    expect(latency.mine.count).toBeGreaterThan(100);
    expect(latency.theirs.count).toBeGreaterThan(100);
  });

  it('words and emoji', () => {
    const period = 'year';
    expect(getWordCloud({ period, filter: 'useful' }, db).terms.length).toBeGreaterThan(20);
    const emoji = getEmojiAnalytics({ period }, db);
    expect(emoji.topEmojis.length).toBeGreaterThan(5);
    expect(emoji.topEmojiUsers.length).toBeGreaterThan(5);
    const distinctive = getDistinctiveWords({ period }, db);
    expect(distinctive.mine.length).toBeGreaterThan(3);
    expect(distinctive.theirs.length).toBeGreaterThan(3);
  });

  it('conversation dynamics, including ghosts and every trajectory', () => {
    const dynamics = getConversationDynamics({ period: 'all', limit: 50 }, db);
    expect(dynamics.initiationRatio.length).toBeGreaterThan(5);
    expect(dynamics.conversationDepth.length).toBeGreaterThan(5);
    expect(dynamics.lateNightTexters.length).toBeGreaterThan(5);
    expect(Math.max(...dynamics.ghostScore.map((row) => row.ghostRate))).toBeGreaterThan(0.3);
    expect(new Set(dynamics.relationshipTrajectory.map((row) => row.direction)))
      .toEqual(new Set(['growing', 'fading', 'stable']));
  });

  it('people who drifted away', () => {
    const names = getDormancy({ limit: 50 }, db).contacts.map((contact) => contact.name);
    expect(names).toContain('Rosalind Franklin');
  });

  it('archived chats, some still going', () => {
    const archived = getArchivedChats({}, db);
    expect(archived.available).toBe(true);
    expect(archived.archivedDirect).toBeGreaterThan(0);
    expect(archived.archivedGroups).toBeGreaterThan(0);
    expect(archived.stillActiveCount).toBeGreaterThan(0);
  });

  it('group graveyard, including a group that never spoke', () => {
    const lifecycle = getGroupLifecycle({}, db);
    expect(lifecycle.deadGroups).toBeGreaterThan(2);
    expect(lifecycle.neverActiveGroups).toBe(1);
    expect(lifecycle.graveyard.length).toBeGreaterThan(2);
    expect(lifecycle.oldestAlive).not.toBeNull();
    expect(lifecycle.foundedByYear.length).toBeGreaterThan(3);
  });

  it('link report covers every category', () => {
    const links = getLinkIntelligence({ period: 'year' }, db);
    expect(links.totalLinks).toBeGreaterThan(100);
    expect(new Set(links.linkCategories.map((row) => row.category)))
      .toEqual(new Set(['video', 'social', 'news', 'shopping', 'music', 'dev', 'reference', 'other']));
    expect(links.sharingAsymmetry.length).toBeGreaterThan(3);
    expect(links.mediaTimeline.length).toBeGreaterThan(10);
    expect(links.firstShared.length).toBeGreaterThan(3);
  });

  it('year in review, this year and the one before', () => {
    const year = new Date().getFullYear();
    const review = getYearInReview({ year }, db);
    expect(review.totals.messages).toBeGreaterThan(0);
    expect(review.topChats.length).toBeGreaterThan(3);
    expect(review.previousYear).not.toBeNull();
    expect(review.topWords.length).toBeGreaterThan(5);
    expect(review.topEmojis.length).toBeGreaterThan(3);
    expect(getYearInReview({ year: year - 1 }, db).newContacts.length).toBeGreaterThan(0);
  });

  it('contact profile', () => {
    const profile = getContactProfile({ jid: adaJid() }, db);
    expect(profile.totals.messages).toBeGreaterThan(500);
    expect(profile.monthlyVolume.length).toBeGreaterThan(12);
    expect(profile.topWords.length).toBeGreaterThan(5);
    expect(profile.topEmojis.length).toBeGreaterThan(3);
  });

  it('group profile, with lurkers but without the archive owner among them', () => {
    const profile = getGroupProfile({ jid: groupJid('Neighbourhood Watch') }, db);
    expect(profile.topParticipants.length).toBeGreaterThan(3);
    expect(profile.quietMembers.length).toBeGreaterThan(5);
    expect(profile.quietMembers.map((member) => member.jid)).not.toContain('15550000000@s.whatsapp.net');
    // The same person under a phone JID and an @lid must merge into one speaker.
    const speakers = getGroupProfile({ jid: groupJid('Family Dinner Planning'), limit: 50 }, db).topParticipants;
    expect(speakers.filter((speaker) => speaker.jid.endsWith('@lid'))).toEqual([]);
  });

  it('people and chats lists', () => {
    expect(getPeople({ limit: 200 }, db).data.length).toBeGreaterThan(40);
    const chats = getChats({ limit: 200 }, db).data;
    expect(chats.some((chat) => chat.kind === 'group')).toBe(true);
    expect(chats.some((chat) => chat.kind === 'dm')).toBe(true);
  });

  it('search uses the full-text index and finds the fixed messages', () => {
    const results = searchMessages({ q: 'lighthouse' }, db);
    expect(results.pagination.total).toBeGreaterThanOrEqual(3);
    expect(results.data.map((hit) => hit.chatName)).toContain('Ada Lovelace');
    expect(db.prepare('SELECT COUNT(*) FROM messages_fts').pluck().get()).toBe(getOverviewStats(db).totalMessages);
  });
});

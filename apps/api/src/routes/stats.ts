import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.js';
import { canonicalJidSql, cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins, isPersonJidSql } from '../lib/displayName.js';
import { mean } from '../lib/percentile.js';
import { etagFor, getCached, statsCacheKey } from '../lib/statsCache.js';
import {
  bucketDateSql,
  normalizeBucketDate,
  parseGranularity,
  parseLimit,
  parsePeriod,
  parseYear,
  scanCoverage,
  sinceTimestamp,
  unixSecondsToIso,
  yearBounds,
} from '../lib/query.js';
import {
  dateInTimezone,
  hourInTimezone,
  monthInTimezone,
  resolveStatsTimeZone,
  SERVER_TIME_ZONE,
  tsModifierSql,
  weekdayHourInTimezone,
} from '../lib/timezone.js';
import type {
  ActivityHeatmapPoint,
  ConversationDepthStat,
  ConversationDynamics,
  DayOfWeekStat,
  EmojiAnalytics,
  EmojiContactStat,
  EmojiStat,
  GhostScoreStat,
  GroupActivityStat,
  HourOfDayStat,
  InitiationRatioStat,
  LateNightTexterStat,
  MediaBreakdownStat,
  MediaSenderStat,
  MessageStreaks,
  MessageVolumePoint,
  OverviewStats,
  RelationshipTrajectoryStat,
  ReplyLatencyDistribution,
  ResponseTimeStat,
  SentReceivedRatioPoint,
  TopContact,
  WeeklyRhythm,
  WeeklyRhythmCell,
  WordCloud,
  WordCloudTerm,
} from '../types.js';
import {
  getContactProfile,
  getGroupDirectory,
  getGroupLifecycle,
  getGroupProfile,
} from './stats/profiles.js';
import {
  getArchivedChats,
  getDistinctiveWords,
  getDormancy,
  getLinkIntelligence,
  getYearInReview,
} from './stats/reports.js';
import {
  ChatNotFoundError,
  EMOJI_REGEX,
  GHOST_WINDOW_SECONDS,
  isNoiseToken,
  NotAGroupError,
  resolveChatNames,
  SESSION_GAP_SECONDS,
  summarizeGaps,
  WORD_TOKEN_RE,
} from './stats/shared.js';

export {
  ChatNotFoundError,
  getArchivedChats,
  getContactProfile,
  getDistinctiveWords,
  getDormancy,
  getGroupDirectory,
  getGroupLifecycle,
  getGroupProfile,
  getLinkIntelligence,
  getYearInReview,
  NotAGroupError,
};

interface CountRow {
  count: number;
}

interface OverviewRow {
  totalMessages: number;
  totalMediaFiles: number;
  oldestTs: number | null;
  newestTs: number | null;
}

interface TopContactRow {
  jid: string | null;
  name: string | null;
  phone: string | null;
  messageCount: number;
  sentByMe: number;
  sentByThem: number;
}

interface MessageVolumeRow {
  date: string;
  sent: number;
  received: number;
}

interface ActivityHeatmapRow {
  date: string;
  count: number;
}

interface DayOfWeekRow {
  day: string;
  count: number;
}

interface MediaBreakdownRow {
  mediaType: string;
  count: number;
  totalBytes: number;
}

interface MediaSenderRow {
  jid: string | null;
  name: string | null;
  mediaCount: number;
  totalBytes: number;
}

interface SentReceivedRatioRow {
  month: string;
  sent: number;
  received: number;
}

interface ReplyGapRow {
  jid: string;
  responder_from_me: number;
  gap: number;
}

interface GroupActivityRow {
  jid: string;
  name: string | null;
  messageCount: number;
  participantCount: number;
}

interface DateRow {
  date: string;
}

interface TextRow {
  text: string | null;
}

export function getOverviewStats(db: Database = getDb()): OverviewStats {
  const messageRow = db.prepare(`
    SELECT
      COUNT(*) AS totalMessages,
      SUM(CASE WHEN media_type IS NOT NULL AND media_type <> '' THEN 1 ELSE 0 END) AS totalMediaFiles,
      MIN(ts) AS oldestTs,
      MAX(ts) AS newestTs
    FROM messages
  `).get() as OverviewRow;

  const chatRow = db.prepare('SELECT COUNT(*) AS count FROM chats').get() as CountRow;
  const contactRow = db.prepare('SELECT COUNT(*) AS count FROM contacts').get() as CountRow;

  return {
    totalMessages: messageRow.totalMessages,
    totalChats: chatRow.count,
    totalContacts: contactRow.count,
    totalMediaFiles: messageRow.totalMediaFiles ?? 0,
    oldestMessage: unixSecondsToIso(messageRow.oldestTs),
    newestMessage: unixSecondsToIso(messageRow.newestTs),
  };
}

export function getTopContacts(params: { period?: unknown; limit?: unknown }, db: Database = getDb()): TopContact[] {
  const period = parsePeriod(params.period);
  const limit = parseLimit(params.limit, 10, 50);
  const since = sinceTimestamp(period);

  const rows = db.prepare(`
    WITH normalized_messages AS (
      SELECT
        COALESCE(
          contacts_jid.jid,
          contacts_lid.jid,
          CASE
            WHEN from_me = 1 THEN chat_jid
            ELSE COALESCE(sender_jid, chat_jid)
          END
        ) AS jid,
        ${contactDisplayNameSql('contacts')} AS contact_name,
        COALESCE(contacts_jid.phone, contacts_lid.phone) AS contact_phone,
        ${cleanDisplayNameSql(`
          CASE
            WHEN from_me = 1 THEN messages.chat_name
            ELSE messages.sender_name
          END
        `)} AS message_name,
        ${cleanDisplayNameSql(`
          COALESCE(
            chats.name,
            CASE
              WHEN messages.chat_jid = CASE
                WHEN messages.from_me = 1 THEN messages.chat_jid
                ELSE COALESCE(messages.sender_jid, messages.chat_jid)
              END THEN messages.chat_name
              ELSE NULL
            END
          )
        `)} AS direct_chat_name,
        from_me
      FROM messages
      LEFT JOIN chats ON chats.jid = CASE
        WHEN messages.from_me = 1 THEN messages.chat_jid
        ELSE COALESCE(messages.sender_jid, messages.chat_jid)
      END
      ${contactLeftJoins('contacts', `CASE
        WHEN messages.from_me = 1 THEN messages.chat_jid
        ELSE COALESCE(messages.sender_jid, messages.chat_jid)
      END`)}
      WHERE ts >= @since
    )
    SELECT
      jid,
      COALESCE(
        MAX(message_name),
        MAX(direct_chat_name),
        MAX(contact_name),
        ${cleanDisplayNameSql('jid')},
        'Unknown'
      ) AS name,
      MAX(contact_phone) AS phone,
      COUNT(*) AS messageCount,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sentByMe,
      SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) AS sentByThem
    FROM normalized_messages
    WHERE ${isPersonJidSql('jid')}
    GROUP BY jid
    ORDER BY messageCount DESC
    LIMIT @limit
  `).all({ since, limit }) as TopContactRow[];

  return rows.map((row) => ({
    jid: row.jid ?? 'unknown',
    name: row.name ?? row.jid ?? 'Unknown',
    phone: row.phone?.trim() ? row.phone.trim() : null,
    messageCount: row.messageCount,
    sentByMe: row.sentByMe ?? 0,
    sentByThem: row.sentByThem ?? 0,
  }));
}

export function getMessageVolume(
  params: { period?: unknown; granularity?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): MessageVolumePoint[] {
  const period = parsePeriod(params.period);
  const fallbackGranularity = period === 'year' || period === 'all' ? 'month' : 'day';
  const granularity = parseGranularity(params.granularity, fallbackGranularity);
  const since = sinceTimestamp(period);
  const bucketSql = bucketDateSql(granularity, resolveStatsTimeZone(params.timeZone));

  const rows = db.prepare(`
    SELECT
      ${bucketSql} AS date,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) AS received
    FROM messages
    WHERE ts >= @since
    GROUP BY date
    ORDER BY date ASC
  `).all({ since }) as MessageVolumeRow[];

  return rows.map((row) => ({
    date: normalizeBucketDate(row.date, granularity),
    sent: row.sent ?? 0,
    received: row.received ?? 0,
  }));
}

export function getActivityHeatmap(
  params: { year?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): ActivityHeatmapPoint[] {
  const year = parseYear(params.year);
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const bounds = yearBounds(year, timeZone);

  return db.prepare(`
    SELECT date(${tsModifierSql(timeZone)}) AS date, COUNT(*) AS count
    FROM messages
    WHERE ts >= @start AND ts < @end
    GROUP BY date
    ORDER BY date ASC
  `).all(bounds) as ActivityHeatmapRow[];
}

export function getHourOfDayStats(params: { period?: unknown; timeZone?: unknown }, db: Database = getDb()): HourOfDayStat[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const timeZone = resolveStatsTimeZone(params.timeZone);

  if (timeZone === 'UTC' || timeZone === SERVER_TIME_ZONE) {
    return db.prepare(`
      SELECT CAST(strftime('%H', ${tsModifierSql(timeZone)}) AS INTEGER) AS hour, COUNT(*) AS count
      FROM messages
      WHERE ts >= @since
      GROUP BY hour
      ORDER BY hour ASC
    `).all({ since }) as HourOfDayStat[];
  }

  const rows = db.prepare(`
    SELECT ts
    FROM messages
    WHERE ts >= @since
  `).all({ since }) as { ts: number }[];

  const counts = new Array<number>(24).fill(0);
  for (const row of rows) {
    counts[hourInTimezone(row.ts, timeZone)] += 1;
  }

  const out: HourOfDayStat[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const count = counts[hour] ?? 0;
    if (count > 0) out.push({ hour, count });
  }
  return out;
}

export function getDayOfWeekStats(
  params: { period?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): DayOfWeekStat[] {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = db.prepare(`
    SELECT strftime('%w', ${tsModifierSql(resolveStatsTimeZone(params.timeZone))}) AS day, COUNT(*) AS count
    FROM messages
    WHERE ts >= @since
    GROUP BY day
    ORDER BY day ASC
  `).all({ since }) as DayOfWeekRow[];

  return rows.map((row) => {
    const day = Number(row.day);
    return { day, label: labels[day] ?? String(day), count: row.count };
  });
}

export function getMediaBreakdown(params: { period?: unknown }, db: Database = getDb()): MediaBreakdownStat[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = db.prepare(`
    SELECT media_type AS mediaType, COUNT(*) AS count, COALESCE(SUM(media_size), 0) AS totalBytes
    FROM messages
    WHERE ts >= @since AND media_type IS NOT NULL AND media_type <> ''
    GROUP BY media_type
    ORDER BY count DESC, mediaType ASC
  `).all({ since }) as MediaBreakdownRow[];

  return rows.map((row) => ({
    mediaType: row.mediaType,
    count: row.count,
    totalBytes: row.totalBytes ?? 0,
  }));
}

export function getMediaSenders(params: { period?: unknown; limit?: unknown }, db: Database = getDb()): MediaSenderStat[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 10, 50);
  const rows = db.prepare(`
  WITH normalized AS (
      SELECT
        ${canonicalJidSql('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')} AS jid,
        ${cleanDisplayNameSql('CASE WHEN from_me = 1 THEN COALESCE(chats.name, chat_name) ELSE sender_name END')} AS message_name,
        ${contactDisplayNameSql('contacts')} AS contact_name,
        media_size
      FROM messages
      LEFT JOIN chats ON chats.jid = CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END
      ${contactLeftJoins('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')}
      WHERE ts >= @since AND media_type IS NOT NULL AND media_type <> ''
    )
    SELECT
      jid,
      COALESCE(MAX(message_name), MAX(contact_name), ${cleanDisplayNameSql('jid')}, 'Unknown') AS name,
      COUNT(*) AS mediaCount,
      COALESCE(SUM(media_size), 0) AS totalBytes
    FROM normalized
    WHERE ${isPersonJidSql('jid')}
    GROUP BY jid
    ORDER BY mediaCount DESC, name COLLATE NOCASE ASC
    LIMIT @limit
  `).all({ since, limit }) as MediaSenderRow[];

  return rows.map((row) => ({
    jid: row.jid ?? 'unknown',
    name: row.name ?? row.jid ?? 'Unknown',
    mediaCount: row.mediaCount,
    totalBytes: row.totalBytes ?? 0,
  }));
}

export function getSentReceivedRatio(
  params: { period?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): SentReceivedRatioPoint[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-01', ${tsModifierSql(resolveStatsTimeZone(params.timeZone))}) AS month,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) AS received
    FROM messages
    WHERE ts >= @since
    GROUP BY month
    ORDER BY month ASC
  `).all({ since }) as SentReceivedRatioRow[];

  return rows.map((row) => ({
    month: row.month,
    sent: row.sent ?? 0,
    received: row.received ?? 0,
    ratio: row.received ? Number((row.sent / row.received).toFixed(2)) : null,
  }));
}

/** Backstop on reply gaps pulled into memory for percentile work (2 narrow columns each). */
const REPLY_GAP_MAX_ROWS = 400_000;
const REPLY_GAP_CACHE_TTL_MS = 60_000;

interface CachedReplyGaps {
  signature: string;
  expiresAt: number;
  rows: ReplyGapRow[];
}

const replyGapCache = new WeakMap<Database, Map<string, CachedReplyGaps>>();

function dbMutationSignature(db: Database): string {
  const changesRow = db.prepare('SELECT total_changes() AS changes').get() as { changes: number };
  const dataVersion = Number(db.pragma('data_version', { simple: true }) ?? 0);
  return `${changesRow.changes}:${dataVersion}`;
}

/**
 * Every turn-taking gap in the window: one row per message that reversed the
 * direction of the conversation, carrying who sent it and how long they took.
 *
 * Shared by the per-chat leaderboard and the archive-wide latency distribution.
 */
function selectReplyGaps(periodKey: string, since: number, db: Database): ReplyGapRow[] {
  let perDb = replyGapCache.get(db);
  if (!perDb) {
    perDb = new Map();
    replyGapCache.set(db, perDb);
  }

  const now = Date.now();
  const signature = dbMutationSignature(db);
  const cached = perDb.get(periodKey);
  if (cached && cached.signature === signature && cached.expiresAt > now) {
    return cached.rows;
  }

  const rows = db.prepare(`
    SELECT jid, responder_from_me, gap
    FROM (
      SELECT
        chat_jid AS jid,
        from_me AS responder_from_me,
        ts - LAG(ts) OVER (PARTITION BY chat_jid ORDER BY ts, rowid) AS gap,
        LAG(from_me) OVER (PARTITION BY chat_jid ORDER BY ts, rowid) AS previous_from_me,
        ts
      FROM messages
      WHERE ts >= @since
    )
    WHERE gap IS NOT NULL
      AND gap > 0
      AND previous_from_me IS NOT NULL
      AND previous_from_me <> responder_from_me
    ORDER BY ts DESC
    LIMIT ${REPLY_GAP_MAX_ROWS}
  `).all({ since }) as ReplyGapRow[];

  perDb.set(periodKey, {
    signature,
    expiresAt: now + REPLY_GAP_CACHE_TTL_MS,
    rows,
  });
  return rows;
}

/**
 * Per-chat turnaround, reported as percentiles and split by who was replying.
 */
export function getResponseTimes(
  params: { period?: unknown; limit?: unknown; minResponses?: unknown },
  db: Database = getDb(),
): ResponseTimeStat[] {
  const period = parsePeriod(params.period);
  const since = sinceTimestamp(period);
  const limit = parseLimit(params.limit, 10, 50);
  const minResponses = parseLimit(params.minResponses, 5, 1000);

  const perChat = new Map<string, { mine: number[]; theirs: number[] }>();
  for (const row of selectReplyGaps(period, since, db)) {
    let entry = perChat.get(row.jid);
    if (!entry) {
      entry = { mine: [], theirs: [] };
      perChat.set(row.jid, entry);
    }
    (row.responder_from_me ? entry.mine : entry.theirs).push(row.gap);
  }

  const ranked = [...perChat.entries()]
    .map(([jid, { mine, theirs }]) => {
      const all = [...mine, ...theirs];
      const overall = summarizeGaps(all);
      return {
        jid,
        responseCount: all.length,
        averageSeconds: Math.round(mean(all)),
        medianSeconds: overall.median,
        p90Seconds: overall.p90,
        myResponseCount: mine.length,
        myMedianSeconds: mine.length ? summarizeGaps(mine).median : null,
        theirResponseCount: theirs.length,
        theirMedianSeconds: theirs.length ? summarizeGaps(theirs).median : null,
      };
    })
    .filter((stat) => stat.responseCount >= minResponses)
    .sort((a, b) => a.medianSeconds - b.medianSeconds || b.responseCount - a.responseCount)
    .slice(0, limit);

  const names = resolveChatNames(ranked.map((stat) => stat.jid), db);
  return ranked.map((stat) => ({ ...stat, name: names.get(stat.jid) ?? stat.jid }));
}

/** Bucket edges in seconds; the last bucket is open-ended. */
const REPLY_LATENCY_BUCKETS: Array<{ from: number; to: number | null; label: string }> = [
  { from: 0, to: 60, label: '< 1 min' },
  { from: 60, to: 300, label: '1–5 min' },
  { from: 300, to: 900, label: '5–15 min' },
  { from: 900, to: 3600, label: '15–60 min' },
  { from: 3600, to: 4 * 3600, label: '1–4 h' },
  { from: 4 * 3600, to: 12 * 3600, label: '4–12 h' },
  { from: 12 * 3600, to: 86_400, label: '12–24 h' },
  { from: 86_400, to: 3 * 86_400, label: '1–3 d' },
  { from: 3 * 86_400, to: null, label: '3 d +' },
];

/**
 * Archive-wide shape of how fast replies happen, split by who is replying.
 */
export function getReplyLatency(
  params: { period?: unknown },
  db: Database = getDb(),
): ReplyLatencyDistribution {
  const period = parsePeriod(params.period);
  const since = sinceTimestamp(period);
  const rows = selectReplyGaps(period, since, db);

  const buckets = REPLY_LATENCY_BUCKETS.map((bucket) => ({
    fromSeconds: bucket.from,
    toSeconds: bucket.to,
    label: bucket.label,
    mine: 0,
    theirs: 0,
  }));

  const mine: number[] = [];
  const theirs: number[] = [];

  for (const row of rows) {
    const index = REPLY_LATENCY_BUCKETS.findIndex((b) => b.to === null || row.gap < b.to);
    const bucket = buckets[index === -1 ? buckets.length - 1 : index];
    if (row.responder_from_me) {
      bucket.mine += 1;
      mine.push(row.gap);
    } else {
      bucket.theirs += 1;
      theirs.push(row.gap);
    }
  }

  const side = (gaps: number[]) => {
    const { median, p90 } = summarizeGaps(gaps);
    return { count: gaps.length, medianSeconds: median, p90Seconds: p90 };
  };

  return {
    buckets,
    mine: side(mine),
    theirs: side(theirs),
    scan: scanCoverage(rows.length, REPLY_GAP_MAX_ROWS),
  };
}

export function getGroupActivity(params: { period?: unknown; limit?: unknown }, db: Database = getDb()): GroupActivityStat[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 10, 50);
  const rows = db.prepare(`
    SELECT
      chats.jid,
      COALESCE(${cleanDisplayNameSql('chats.name')}, ${cleanDisplayNameSql('MAX(messages.chat_name)')}, ${cleanDisplayNameSql('chats.jid')}, 'Unknown') AS name,
      COUNT(messages.rowid) AS messageCount,
      COUNT(DISTINCT CASE WHEN messages.from_me = 0 THEN messages.sender_jid END) AS participantCount
    FROM chats
    JOIN messages ON messages.chat_jid = chats.jid
    WHERE chats.kind = 'group' AND messages.ts >= @since
    GROUP BY chats.jid
    ORDER BY messageCount DESC, name COLLATE NOCASE ASC
    LIMIT @limit
  `).all({ since, limit }) as GroupActivityRow[];

  return rows.map((row) => ({
    jid: row.jid,
    name: row.name ?? row.jid,
    messageCount: row.messageCount,
    participantCount: row.participantCount,
  }));
}

export function getMessageStreaks(
  params: { period?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): MessageStreaks {
  const since = sinceTimestamp(parsePeriod(params.period));
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const rows = db.prepare(`
    SELECT DISTINCT date(${tsModifierSql(timeZone)}) AS date
    FROM messages
    WHERE ts >= @since
    ORDER BY date ASC
  `).all({ since }) as DateRow[];

  let longestStreak = 0;
  let activeRun = 0;
  let previousTime: number | null = null;
  for (const row of rows) {
    const time = Date.parse(`${row.date}T00:00:00.000Z`);
    activeRun = previousTime != null && time - previousTime === 86_400_000 ? activeRun + 1 : 1;
    longestStreak = Math.max(longestStreak, activeRun);
    previousTime = time;
  }

  const todayUtc = Date.parse(`${dateInTimezone(Math.floor(Date.now() / 1000), timeZone)}T00:00:00.000Z`);
  const lastTime = rows.length ? Date.parse(`${rows[rows.length - 1].date}T00:00:00.000Z`) : null;
  const currentStreak = lastTime != null && todayUtc - lastTime <= 86_400_000 ? activeRun : 0;

  return { currentStreak, longestStreak };
}

function parseWordCloudFilter(value: unknown): 'all' | 'useful' {
  return value === 'useful' ? 'useful' : 'all';
}

/** Messages scanned for terms; the newest ones, when the archive is larger. */
const WORD_CLOUD_MAX_ROWS = 30_000;

export function getWordCloud(
  params: { period?: unknown; limit?: unknown; filter?: unknown },
  db: Database = getDb(),
): WordCloud {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 50, 200);
  const filterMode = parseWordCloudFilter(params.filter);
  const rows = db.prepare(`
    SELECT text
    FROM messages
    WHERE ts >= @since AND text IS NOT NULL AND TRIM(text) <> ''
    ORDER BY ts DESC
    LIMIT ${WORD_CLOUD_MAX_ROWS}
  `).all({ since }) as TextRow[];
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const term of (row.text ?? '').toLowerCase().match(WORD_TOKEN_RE) ?? []) {
      if (filterMode === 'useful' && isNoiseToken(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  const terms: WordCloudTerm[] = [...counts.entries()]
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text))
    .slice(0, limit);

  return { terms, scan: scanCoverage(rows.length, WORD_CLOUD_MAX_ROWS) };
}

/** Text messages scanned for emoji; the newest ones, when the archive is larger. */
const EMOJI_MAX_ROWS = 50_000;

interface EmojiMessageRow {
  text: string | null;
  from_me: number;
  jid: string | null;
  name: string | null;
  contact_name: string | null;
}

export function getEmojiAnalytics(params: { period?: unknown; limit?: unknown }, db: Database = getDb()): EmojiAnalytics {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 15, 50);

  const rows = db.prepare(`
    SELECT
      messages.text,
      messages.from_me,
      ${canonicalJidSql('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')} AS jid,
      ${cleanDisplayNameSql(`CASE WHEN messages.from_me = 1 THEN COALESCE(chats.name, messages.chat_name) ELSE messages.sender_name END`)} AS name,
      ${contactDisplayNameSql('contacts')} AS contact_name
    FROM messages
    LEFT JOIN chats ON chats.jid = CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END
    ${contactLeftJoins('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')}
    WHERE messages.ts >= @since AND messages.text IS NOT NULL AND messages.text <> ''
    ORDER BY messages.ts DESC
    LIMIT ${EMOJI_MAX_ROWS}
  `).all({ since }) as EmojiMessageRow[];

  const allCounts = new Map<string, number>();
  const sentCounts = new Map<string, number>();
  const receivedCounts = new Map<string, number>();
  const userCounts = new Map<string, { name: string; count: number; emojis: Map<string, number> }>();
  let totalEmojiCount = 0;

  for (const row of rows) {
    const emojis = (row.text ?? '').match(EMOJI_REGEX);
    if (!emojis || emojis.length === 0) continue;

    totalEmojiCount += emojis.length;
    const jid = row.jid ?? 'unknown';
    const isPerson = !jid.endsWith('@g.us') && !jid.endsWith('@status') && !jid.endsWith('@broadcast');
    const displayName = row.name ?? row.contact_name ?? jid;

    let userEntry: { name: string; count: number; emojis: Map<string, number> } | undefined;
    if (isPerson) {
      if (!userCounts.has(jid)) {
        userCounts.set(jid, { name: displayName, count: 0, emojis: new Map() });
      }
      userEntry = userCounts.get(jid)!;
    }

    for (const emoji of emojis) {
      allCounts.set(emoji, (allCounts.get(emoji) ?? 0) + 1);

      if (row.from_me) {
        sentCounts.set(emoji, (sentCounts.get(emoji) ?? 0) + 1);
      } else {
        receivedCounts.set(emoji, (receivedCounts.get(emoji) ?? 0) + 1);
      }

      if (userEntry) {
        userEntry.count += 1;
        userEntry.emojis.set(emoji, (userEntry.emojis.get(emoji) ?? 0) + 1);
      }
    }
  }

  const sortMap = (map: Map<string, number>, n: number): EmojiStat[] =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([emoji, count]) => ({ emoji, count }));

  const topEmojiUsers: EmojiContactStat[] = [...userCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([jid, entry]) => {
      const topEmoji = [...entry.emojis.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return { jid, name: entry.name, count: entry.count, topEmoji };
    });

  return {
    topEmojis: sortMap(allCounts, limit),
    topSentEmojis: sortMap(sentCounts, limit),
    topReceivedEmojis: sortMap(receivedCounts, limit),
    totalEmojiCount,
    uniqueEmojiCount: allCounts.size,
    topEmojiUsers,
    scan: scanCoverage(rows.length, EMOJI_MAX_ROWS),
  };
}

/** Upper bound on rows pulled into memory for session analysis (3 narrow columns each). */
const CONVERSATION_DYNAMICS_MAX_ROWS = 250_000;

interface ChatMessageRow {
  chat_jid: string;
  ts: number;
  from_me: number;
}

function computeTrajectoryDirection(trend: Array<{ count: number }>): 'growing' | 'fading' | 'stable' {
  if (trend.length < 4) return 'stable';
  const half = Math.floor(trend.length / 2);
  const firstHalfAvg = trend.slice(0, half).reduce((s, p) => s + p.count, 0) / half;
  const secondHalfAvg = trend.slice(half).reduce((s, p) => s + p.count, 0) / (trend.length - half);
  const ratio = secondHalfAvg / (firstHalfAvg || 1);
  if (ratio > 1.25) return 'growing';
  if (ratio < 0.75) return 'fading';
  return 'stable';
}

export function getConversationDynamics(
  params: { period?: unknown; limit?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): ConversationDynamics {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 10, 50);
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const ghostCutoff = Math.floor(Date.now() / 1000) - GHOST_WINDOW_SECONDS;

  const rows = db.prepare(`
    SELECT chat_jid, ts, from_me
    FROM (
      SELECT chat_jid, ts, from_me, rowid
      FROM messages
      WHERE ts >= @since
      ORDER BY ts DESC, rowid DESC
      LIMIT ${CONVERSATION_DYNAMICS_MAX_ROWS}
    )
    ORDER BY chat_jid, ts, rowid
  `).all({ since }) as ChatMessageRow[];

  const chatGroups = new Map<string, ChatMessageRow[]>();
  for (const row of rows) {
    let group = chatGroups.get(row.chat_jid);
    if (!group) {
      group = [];
      chatGroups.set(row.chat_jid, group);
    }
    group.push(row);
  }

  const rawInitiation: Array<{ jid: string; byMe: number; byThem: number; total: number }> = [];
  const rawDepth: Array<{ jid: string; avgDepth: number; sessions: number; total: number }> = [];
  const rawGhost: Array<{ jid: string; ghosted: number; totalSent: number }> = [];
  const rawLateNight: Array<{ jid: string; lateNight: number; workHours: number; other: number; total: number }> = [];
  const rawTrajectory: Array<{ jid: string; monthCounts: Map<string, number>; total: number }> = [];

  for (const [jid, messages] of chatGroups) {
    if (messages.length < 2) continue;

    let byMe = 0;
    let byThem = 0;
    let sessionStart = 0;
    const sessionSizes: number[] = [];

    if (messages[0].from_me) byMe++;
    else byThem++;

    for (let i = 1; i < messages.length; i++) {
      if (messages[i].ts - messages[i - 1].ts >= SESSION_GAP_SECONDS) {
        sessionSizes.push(i - sessionStart);
        sessionStart = i;
        if (messages[i].from_me) byMe++;
        else byThem++;
      }
    }
    sessionSizes.push(messages.length - sessionStart);

    const totalSessions = sessionSizes.length;
    rawInitiation.push({ jid, byMe, byThem, total: byMe + byThem });
    rawDepth.push({ jid, avgDepth: Math.round((messages.length / totalSessions) * 10) / 10, sessions: totalSessions, total: messages.length });

    let ghosted = 0;
    let totalSent = 0;
    let nextReceivedTs: number | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message.from_me) {
        nextReceivedTs = message.ts;
        continue;
      }
      if (message.ts > ghostCutoff) continue;
      totalSent++;
      if (nextReceivedTs === null || nextReceivedTs - message.ts > GHOST_WINDOW_SECONDS) ghosted++;
    }

    if (totalSent > 0) {
      rawGhost.push({ jid, ghosted, totalSent });
    }

    let lateNight = 0;
    let workHrs = 0;
    let other = 0;
    for (const msg of messages) {
      const hour = hourInTimezone(msg.ts, timeZone);
      if (hour < 5) lateNight++;
      else if (hour >= 9 && hour < 17) workHrs++;
      else other++;
    }
    rawLateNight.push({ jid, lateNight, workHours: workHrs, other, total: messages.length });

    const monthCounts = new Map<string, number>();
    for (const msg of messages) {
      const month = monthInTimezone(msg.ts, timeZone);
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }
    rawTrajectory.push({ jid, monthCounts, total: messages.length });
  }

  const topInitiation = rawInitiation.filter((r) => r.total >= 3).sort((a, b) => b.total - a.total).slice(0, limit);
  const topDepth = rawDepth.filter((r) => r.sessions >= 3).sort((a, b) => b.avgDepth - a.avgDepth).slice(0, limit);
  const topGhost = rawGhost.filter((r) => r.totalSent >= 3).sort((a, b) => (b.ghosted / b.totalSent) - (a.ghosted / a.totalSent)).slice(0, limit);
  const topLateNight = rawLateNight.filter((r) => r.lateNight > 0).sort((a, b) => b.lateNight - a.lateNight).slice(0, limit);
  const topTrajectory = rawTrajectory.filter((r) => r.monthCounts.size >= 2).sort((a, b) => b.total - a.total).slice(0, limit);

  const allJids = new Set<string>();
  for (const r of topInitiation) allJids.add(r.jid);
  for (const r of topDepth) allJids.add(r.jid);
  for (const r of topGhost) allJids.add(r.jid);
  for (const r of topLateNight) allJids.add(r.jid);
  for (const r of topTrajectory) allJids.add(r.jid);

  const names = resolveChatNames([...allJids], db);
  const name = (jid: string) => names.get(jid) ?? jid;

  const initiationRatio: InitiationRatioStat[] = topInitiation.map((r) => ({
    jid: r.jid,
    name: name(r.jid),
    initiatedByMe: r.byMe,
    initiatedByThem: r.byThem,
    ratio: Math.round((r.byMe / r.total) * 100) / 100,
  }));

  const conversationDepth: ConversationDepthStat[] = topDepth.map((r) => ({
    jid: r.jid,
    name: name(r.jid),
    avgMessagesPerSession: r.avgDepth,
    totalSessions: r.sessions,
  }));

  const ghostScore: GhostScoreStat[] = topGhost.map((r) => ({
    jid: r.jid,
    name: name(r.jid),
    ghostedCount: r.ghosted,
    totalSent: r.totalSent,
    ghostRate: Math.round((r.ghosted / r.totalSent) * 100) / 100,
  }));

  const lateNightTexters: LateNightTexterStat[] = topLateNight.map((r) => ({
    jid: r.jid,
    name: name(r.jid),
    lateNight: r.lateNight,
    workHours: r.workHours,
    otherHours: r.other,
    totalMessages: r.total,
    lateNightPct: Math.round((r.lateNight / r.total) * 100),
  }));

  const relationshipTrajectory: RelationshipTrajectoryStat[] = topTrajectory.map((r) => {
    const sorted = [...r.monthCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const trend = sorted.map(([month, count]) => ({ month, count }));
    return {
      jid: r.jid,
      name: name(r.jid),
      trend,
      direction: computeTrajectoryDirection(trend),
    };
  });

  return {
    initiationRatio,
    conversationDepth,
    ghostScore,
    relationshipTrajectory,
    lateNightTexters,
    scan: scanCoverage(rows.length, CONVERSATION_DYNAMICS_MAX_ROWS),
  };
}

/**
 * Hour × weekday grid: the week's rhythm as one picture.
 */
export function getWeeklyRhythm(params: { period?: unknown; timeZone?: unknown }, db: Database = getDb()): WeeklyRhythm {
  const since = sinceTimestamp(parsePeriod(params.period));
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const rows = db.prepare('SELECT ts FROM messages WHERE ts >= @since').all({ since }) as { ts: number }[];

  const counts = new Array<number>(7 * 24).fill(0);
  for (const row of rows) {
    const { weekday, hour } = weekdayHourInTimezone(row.ts, timeZone);
    counts[weekday * 24 + hour] += 1;
  }

  const cells: WeeklyRhythmCell[] = counts.map((count, index) => ({ day: Math.floor(index / 24), hour: index % 24, count }));
  const peak = cells.reduce<WeeklyRhythmCell | null>((best, cell) => (cell.count > (best?.count ?? 0) ? cell : best), null);
  return { cells, peak, total: rows.length };
}

export const statsRouter = Router();

/**
 * Wrap a stats query in the archive-fingerprinted cache.
 */
function cachedStats<T>(route: string, compute: (query: Request['query']) => T): RequestHandler {
  return (req, res) => {
    const key = statsCacheKey(route, req.query as Record<string, unknown>);
    const etag = etagFor(key);

    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.json(getCached(key, () => compute(req.query)));
  };
}

statsRouter.get('/overview', cachedStats('overview', () => getOverviewStats()));
statsRouter.get('/top-contacts', cachedStats('top-contacts', (query) => getTopContacts(query)));
statsRouter.get('/message-volume', cachedStats('message-volume', (query) => getMessageVolume(query)));
statsRouter.get('/activity-heatmap', cachedStats('activity-heatmap', (query) => getActivityHeatmap(query)));
statsRouter.get('/hour-of-day', cachedStats('hour-of-day', (query) => getHourOfDayStats(query)));
statsRouter.get('/day-of-week', cachedStats('day-of-week', (query) => getDayOfWeekStats(query)));
statsRouter.get('/media-breakdown', cachedStats('media-breakdown', (query) => getMediaBreakdown(query)));
statsRouter.get('/media-senders', cachedStats('media-senders', (query) => getMediaSenders(query)));
statsRouter.get('/sent-received-ratio', cachedStats('sent-received-ratio', (query) => getSentReceivedRatio(query)));
statsRouter.get('/response-times', cachedStats('response-times', (query) => getResponseTimes(query)));
statsRouter.get('/reply-latency', cachedStats('reply-latency', (query) => getReplyLatency(query)));
statsRouter.get('/group-activity', cachedStats('group-activity', (query) => getGroupActivity(query)));
statsRouter.get('/streaks', cachedStats('streaks', (query) => getMessageStreaks(query)));
statsRouter.get('/word-cloud', cachedStats('word-cloud', (query) => getWordCloud(query)));
statsRouter.get('/emoji-analytics', cachedStats('emoji-analytics', (query) => getEmojiAnalytics(query)));
statsRouter.get('/conversation-dynamics', cachedStats('conversation-dynamics', (query) => getConversationDynamics(query)));
statsRouter.get('/year-in-review', cachedStats('year-in-review', (query) => getYearInReview(query)));
statsRouter.get('/contact-profile', cachedStats('contact-profile', (query) => getContactProfile(query)));
statsRouter.get('/dormancy', cachedStats('dormancy', (query) => getDormancy(query)));
statsRouter.get('/group-profile', cachedStats('group-profile', (query) => getGroupProfile(query)));
statsRouter.get('/groups', cachedStats('groups', (query) => getGroupDirectory(query)));
statsRouter.get('/link-intelligence', cachedStats('link-intelligence', (query) => getLinkIntelligence(query)));
statsRouter.get('/weekly-rhythm', cachedStats('weekly-rhythm', (query) => getWeeklyRhythm(query)));
statsRouter.get('/distinctive-words', cachedStats('distinctive-words', (query) => getDistinctiveWords(query)));
statsRouter.get('/group-lifecycle', cachedStats('group-lifecycle', (query) => getGroupLifecycle(query)));
statsRouter.get('/archived-chats', cachedStats('archived-chats', (query) => getArchivedChats(query)));

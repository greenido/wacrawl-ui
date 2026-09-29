import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.js';
import { chatKindSql, columnExists, parseChatKind, tableExists } from '../lib/chatKind.js';
import { canonicalJidSql, cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins } from '../lib/displayName.js';
import { resolveSelfJids } from '../lib/selfIdentity.js';
import { mean, percentile } from '../lib/percentile.js';
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
  firstQueryString,
  hourInTimezone,
  monthInTimezone,
  resolveStatsTimeZone,
  tsModifierSql,
  weekdayHourInTimezone,
} from '../lib/timezone.js';
import { USEFUL_WORD_STOP_SET } from '../lib/wordCloudUsefulStopWords.js';
import { categorizeDomain, extractUrls, parseDomain } from '../lib/urlExtract.js';
import type {
  ActivityHeatmapPoint,
  ArchivedChats,
  ContactProfile,
  ContactProfileSilence,
  ConversationDepthStat,
  ConversationDynamics,
  DayOfWeekStat,
  DistinctiveTerm,
  DistinctiveWords,
  DormancyReport,
  EmojiAnalytics,
  EmojiContactStat,
  EmojiStat,
  FirstSharedStat,
  GhostScoreStat,
  GroupActivityStat,
  GroupDirectoryEntry,
  GroupFoundingYear,
  GroupGraveyardEntry,
  GroupLifecycle,
  GroupProfile,
  HourOfDayStat,
  InitiationRatioStat,
  LateNightTexterStat,
  LinkCategoryStat,
  LinkDomainStat,
  LinkIntelligence,
  MediaBreakdownStat,
  MediaSenderStat,
  MediaTimelinePoint,
  MessageStreaks,
  MessageVolumePoint,
  OverviewStats,
  RelationshipTrajectoryStat,
  ReplyLatencyDistribution,
  ResponseTimeStat,
  SentReceivedRatioPoint,
  SharingAsymmetryStat,
  TopContact,
  WeeklyRhythm,
  WeeklyRhythmCell,
  WordCloud,
  WordCloudTerm,
  YearChatStat,
  YearInReview,
} from '../types.js';

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
    WHERE jid IS NOT NULL AND jid <> ''
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
        CASE WHEN from_me = 1 THEN chat_jid ELSE COALESCE(sender_jid, chat_jid) END AS jid,
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
    WHERE jid IS NOT NULL AND jid <> ''
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

/**
 * Every turn-taking gap in the window: one row per message that reversed the
 * direction of the conversation, carrying who sent it and how long they took.
 *
 * Shared by the per-chat leaderboard and the archive-wide latency distribution.
 */
function selectReplyGaps(since: number, db: Database): ReplyGapRow[] {
  return db.prepare(`
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
}

function summarizeGaps(gaps: number[]): { median: number; p90: number } {
  const sorted = [...gaps].sort((a, b) => a - b);
  return { median: Math.round(percentile(sorted, 50)), p90: Math.round(percentile(sorted, 90)) };
}

/**
 * Per-chat turnaround, reported as percentiles and split by who was replying.
 *
 * The previous version averaged the gaps and ordered ascending with no minimum
 * sample, so the leaderboard filled up with three-message chats whose single
 * fast exchange beat every real conversation, and one holiday-long silence was
 * enough to bury a chat that is normally instant. A median plus a p90 describes
 * the same data without either failure mode, and separating my turnaround from
 * theirs is the comparison the card was implicitly promising all along.
 */
export function getResponseTimes(
  params: { period?: unknown; limit?: unknown; minResponses?: unknown },
  db: Database = getDb(),
): ResponseTimeStat[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 10, 50);
  const minResponses = parseLimit(params.minResponses, 5, 1000);

  const perChat = new Map<string, { mine: number[]; theirs: number[] }>();
  for (const row of selectReplyGaps(since, db)) {
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
 *
 * The per-chat leaderboard answers "who is quickest"; this answers "what does a
 * reply normally take", which a single average can never show for a
 * distribution this skewed.
 */
export function getReplyLatency(
  params: { period?: unknown },
  db: Database = getDb(),
): ReplyLatencyDistribution {
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = selectReplyGaps(since, db);

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

  // Both sides are the viewer's calendar day pinned to UTC midnight, so the
  // subtraction stays a whole number of days regardless of the zone's offset.
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

/**
 * Runs of three or more letters or digits, in any script.
 *
 * The previous `[a-z0-9]{3,}` silently discarded every Hebrew, Arabic, Cyrillic
 * and Greek word in the archive, so a bilingual conversation produced a word
 * cloud of only its English half. `\p{N}` covers non-ASCII digits too.
 *
 * Scripts that do not space their words (Chinese, Japanese, Thai) still need a
 * real segmenter; they come out as one token per run rather than per word.
 */
const WORD_TOKEN_RE = /[\p{L}\p{N}]{3,}/gu;
const ALL_DIGITS_RE = /^\p{N}+$/u;

/**
 * Long letter-and-digit runs are media keys and URL slugs, not words.
 *
 * Real archives carry a lot of these — attachment identifiers and tracking
 * parameters — and they were ranking alongside genuine vocabulary. A fixed
 * stopword list cannot catch them because every one is different. Twelve
 * characters clears ordinary alphanumerics like "covid19" and "mp3" while
 * catching the 16- and 26-character keys.
 */
const OPAQUE_TOKEN_RE = /^(?=.{12,})(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N}]+$/u;

/** True for tokens that carry no meaning in a word cloud. */
function isNoiseToken(term: string): boolean {
  return ALL_DIGITS_RE.test(term) || OPAQUE_TOKEN_RE.test(term) || USEFUL_WORD_STOP_SET.has(term);
}

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

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

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
      CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END AS jid,
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
    const displayName = row.name ?? row.contact_name ?? jid;

    if (!userCounts.has(jid)) {
      userCounts.set(jid, { name: displayName, count: 0, emojis: new Map() });
    }
    const userEntry = userCounts.get(jid)!;

    for (const emoji of emojis) {
      allCounts.set(emoji, (allCounts.get(emoji) ?? 0) + 1);

      if (row.from_me) {
        sentCounts.set(emoji, (sentCounts.get(emoji) ?? 0) + 1);
      } else {
        receivedCounts.set(emoji, (receivedCounts.get(emoji) ?? 0) + 1);
      }

      userEntry.count += 1;
      userEntry.emojis.set(emoji, (userEntry.emojis.get(emoji) ?? 0) + 1);
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

const SESSION_GAP_SECONDS = 4 * 3600;
const GHOST_WINDOW_SECONDS = 24 * 3600;

/** Upper bound on rows pulled into memory for session analysis (3 narrow columns each). */
const CONVERSATION_DYNAMICS_MAX_ROWS = 250_000;

interface ChatMessageRow {
  chat_jid: string;
  ts: number;
  from_me: number;
}

interface NameRow {
  jid: string;
  name: string | null;
}

function resolveChatNames(jids: string[], db: Database): Map<string, string> {
  const map = new Map<string, string>();
  if (jids.length === 0) return map;
  const stmt = db.prepare(`
    SELECT
      c.jid,
      COALESCE(
        ${cleanDisplayNameSql('c.name')},
        ${contactDisplayNameSql('chat_contacts')},
        ${cleanDisplayNameSql('c.jid')},
        'Unknown'
      ) AS name
    FROM chats c
    ${contactLeftJoins('chat_contacts', 'c.jid')}
    WHERE c.jid = @jid
  `);
  for (const jid of jids) {
    const row = stmt.get({ jid }) as NameRow | undefined;
    map.set(jid, row?.name ?? jid);
  }
  return map;
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

  // Session detection needs every message, not just the interesting ones, so this
  // is capped by recency the way the word cloud and emoji scans are — an unbounded
  // "all time" load would pull the whole archive into memory on a blocking query.
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

    // Walking backwards keeps the "when did they next reply" lookup to a single
    // pass; the forward version rescanned the tail for every sent message, which
    // degrades to O(n^2) on a chat that is mostly monologue.
    let ghosted = 0;
    let totalSent = 0;
    let nextReceivedTs: number | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message.from_me) {
        nextReceivedTs = message.ts;
        continue;
      }
      // Anything sent inside the window can still be answered. Counting it as a
      // ghost scored the user's own most recent messages against the contact,
      // so every chat looked worse the more recently it had been used.
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

const DAY_SECONDS = 86_400;
const DAYS_PER_MONTH = 30;

/** Messages of one chat pulled in for the profile's per-message analysis. */
const CONTACT_PROFILE_MAX_ROWS = 100_000;

interface ProfileMessageRow {
  ts: number;
  from_me: number;
  text: string | null;
  media_type: string | null;
}

interface ProfileTotalsRow {
  messages: number;
  sentByMe: number;
  media: number;
  firstTs: number | null;
  lastTs: number | null;
  activeDays: number;
}

/** Not-found is a real answer here, so the route can 404 rather than invent an empty profile. */
export class ChatNotFoundError extends Error {
  readonly code = 'CHAT_NOT_FOUND';
  constructor(public readonly jid: string) {
    super(`No chat found for ${jid}.`);
  }
}

/**
 * Asking for the group report on a one-to-one chat is a routing mistake, not a
 * missing chat, and 404 would send the UI looking for a chat that does exist.
 */
export class NotAGroupError extends Error {
  readonly code = 'NOT_A_GROUP';
  constructor(public readonly jid: string) {
    super(`${jid} is not a group chat.`);
  }
}

function topCounted<T>(counts: Map<string, number>, limit: number, build: (key: string, count: number) => T): T[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => build(key, count));
}

/**
 * Everything one relationship looks like, in a single response.
 *
 * The rest of the stats surface is leaderboards, which answer "who is the most
 * X". The question people actually arrive with is usually about one person, and
 * assembling that from a dozen top-10 lists is impossible when they do not
 * appear in any of them.
 *
 * Totals come from an exact aggregate; everything derived per message runs over
 * the most recent CONTACT_PROFILE_MAX_ROWS, reported in `scan`.
 */
export function getContactProfile(
  params: { jid?: unknown; limit?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): ContactProfile {
  const jid = firstQueryString(params.jid);
  if (!jid) throw new ChatNotFoundError('');
  const limit = parseLimit(params.limit, 15, 100);
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const now = Math.floor(Date.now() / 1000);

  const identity = db.prepare(`
    SELECT
      chats.jid AS jid,
      chats.kind AS kind,
      COALESCE(
        ${cleanDisplayNameSql('chats.name')},
        ${contactDisplayNameSql('chat_contacts')},
        ${cleanDisplayNameSql('chats.jid')},
        'Unknown'
      ) AS name,
      COALESCE(chat_contacts_jid.phone, chat_contacts_lid.phone) AS phone
    FROM chats
    ${contactLeftJoins('chat_contacts', 'chats.jid')}
    WHERE chats.jid = @jid
  `).get({ jid }) as { jid: string; kind: string; name: string | null; phone: string | null } | undefined;

  if (!identity) throw new ChatNotFoundError(jid);

  const totalsRow = db.prepare(`
    SELECT
      COUNT(*) AS messages,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sentByMe,
      SUM(CASE WHEN media_type IS NOT NULL AND media_type <> '' THEN 1 ELSE 0 END) AS media,
      MIN(ts) AS firstTs,
      MAX(ts) AS lastTs,
      COUNT(DISTINCT date(${tsModifierSql(timeZone)})) AS activeDays
    FROM messages
    WHERE chat_jid = @jid
  `).get({ jid }) as ProfileTotalsRow;

  const mediaBreakdown = (db.prepare(`
    SELECT media_type AS mediaType, COUNT(*) AS count, COALESCE(SUM(media_size), 0) AS totalBytes
    FROM messages
    WHERE chat_jid = @jid AND media_type IS NOT NULL AND media_type <> ''
    GROUP BY media_type
    ORDER BY count DESC, mediaType ASC
  `).all({ jid }) as MediaBreakdownRow[]).map((row) => ({
    mediaType: row.mediaType,
    count: row.count,
    totalBytes: row.totalBytes ?? 0,
  }));

  const messages = db.prepare(`
    SELECT ts, from_me, text, media_type
    FROM (
      SELECT ts, from_me, text, media_type, rowid
      FROM messages
      WHERE chat_jid = @jid
      ORDER BY ts DESC, rowid DESC
      LIMIT ${CONTACT_PROFILE_MAX_ROWS}
    )
    ORDER BY ts ASC, rowid ASC
  `).all({ jid }) as ProfileMessageRow[];

  const monthly = new Map<string, { sent: number; received: number }>();
  const hourCounts = new Array<number>(24).fill(0);
  const wordCounts = new Map<string, number>();
  const emojiCounts = new Map<string, number>();
  const mineGaps: number[] = [];
  const theirGaps: number[] = [];
  const initiation = { byMe: 0, byThem: 0 };
  const lastWord = { mine: 0, theirs: 0 };
  let longestSilence: ContactProfileSilence | null = null;

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const previous = i > 0 ? messages[i - 1] : null;

    const month = monthInTimezone(message.ts, timeZone);
    let bucket = monthly.get(month);
    if (!bucket) {
      bucket = { sent: 0, received: 0 };
      monthly.set(month, bucket);
    }
    if (message.from_me) bucket.sent += 1;
    else bucket.received += 1;

    hourCounts[hourInTimezone(message.ts, timeZone)] += 1;

    for (const term of (message.text ?? '').toLowerCase().match(WORD_TOKEN_RE) ?? []) {
      if (isNoiseToken(term)) continue;
      wordCounts.set(term, (wordCounts.get(term) ?? 0) + 1);
    }
    for (const emoji of (message.text ?? '').match(EMOJI_REGEX) ?? []) {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1);
    }

    if (previous === null || message.ts - previous.ts >= SESSION_GAP_SECONDS) {
      if (message.from_me) initiation.byMe += 1;
      else initiation.byThem += 1;
      // The message before a lull is the one that ended the previous session.
      if (previous !== null) {
        if (previous.from_me) lastWord.mine += 1;
        else lastWord.theirs += 1;

        const gapDays = Math.floor((message.ts - previous.ts) / DAY_SECONDS);
        if (longestSilence === null || gapDays > longestSilence.days) {
          longestSilence = {
            days: gapDays,
            startedAt: unixSecondsToIso(previous.ts),
            endedAt: unixSecondsToIso(message.ts),
          };
        }
      }
    } else if (previous.from_me !== message.from_me) {
      (message.from_me ? mineGaps : theirGaps).push(message.ts - previous.ts);
    }
  }

  if (messages.length > 0) {
    const final = messages[messages.length - 1];
    if (final.from_me) lastWord.mine += 1;
    else lastWord.theirs += 1;
  }

  const side = (gaps: number[]) => {
    const { median, p90 } = summarizeGaps(gaps);
    return { count: gaps.length, medianSeconds: median, p90Seconds: p90 };
  };

  return {
    jid: identity.jid,
    name: identity.name ?? identity.jid,
    kind: identity.kind,
    phone: identity.phone?.trim() ? identity.phone.trim() : null,
    totals: {
      messages: totalsRow.messages,
      sentByMe: totalsRow.sentByMe ?? 0,
      sentByThem: totalsRow.messages - (totalsRow.sentByMe ?? 0),
      media: totalsRow.media ?? 0,
      firstMessageAt: unixSecondsToIso(totalsRow.firstTs),
      lastMessageAt: unixSecondsToIso(totalsRow.lastTs),
      daysSinceLastMessage: totalsRow.lastTs == null ? null : Math.floor((now - totalsRow.lastTs) / DAY_SECONDS),
      activeDays: totalsRow.activeDays,
    },
    monthlyVolume: [...monthly.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, counts]) => ({ month, ...counts })),
    hourOfDay: hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter((point) => point.count > 0),
    latency: { mine: side(mineGaps), theirs: side(theirGaps) },
    initiation,
    lastWord,
    longestSilence,
    mediaBreakdown,
    topWords: topCounted(wordCounts, limit, (text, value) => ({ text, value })),
    topEmojis: topCounted(emojiCounts, limit, (emoji, count) => ({ emoji, count })),
    scan: scanCoverage(messages.length, CONTACT_PROFILE_MAX_ROWS),
  };
}

/** Messages of one group pulled in for the per-message analysis. */
const GROUP_PROFILE_MAX_ROWS = 100_000;

/** Roster rows are cheap, but a 900-member group should not ship 900 objects. */
const GROUP_QUIET_MEMBER_LIMIT = 50;

interface GroupIdentityRow {
  jid: string;
  name: string | null;
  ownerJid: string | null;
  createdAt: number | null;
}

interface GroupRosterRow {
  /** Collapsed onto the phone JID when contacts knows the LID pairing. */
  jid: string;
  /** As stored, needed to recognise the account owner. */
  rawJid: string;
  name: string | null;
  isAdmin: number;
  isActive: number;
}

interface GroupSpeakerRow {
  jid: string | null;
  /** From my address book. */
  contactName: string | null;
  /** What the sender calls themselves. Least trustworthy of the three. */
  pushName: string | null;
  messageCount: number;
  firstTs: number;
  lastTs: number;
}

interface GroupTotalsRow {
  messages: number;
  sentByMe: number;
  media: number;
  firstTs: number | null;
  lastTs: number | null;
  activeDays: number;
}

interface GroupMember {
  jid: string;
  /** Every spelling this person is recorded under, needed to recognise myself. */
  rawJids: string[];
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
}

/**
 * Collapse a roster onto one row per person.
 *
 * A real archive records the same member twice — a current `@lid` row and a
 * stale phone-JID row left over from an earlier sync — so a 14-person group
 * reported 27 participants, 13 of them "departed". Worse, the stale rows carry
 * `is_active = 0` and sort last, so a lookup by JID marked every single talker
 * in the group as someone who had left it.
 *
 * A person counts as a member if *any* of their rows says so, and as an admin
 * on the same basis: the flags live on whichever row the last sync refreshed.
 */
/** A member the reader could recognise, rather than a bare `@lid` identifier. */
function isNamed(member: GroupMember): boolean {
  return member.name !== null && member.name !== member.jid;
}

function mergeRoster(rows: GroupRosterRow[]): Map<string, GroupMember> {
  const merged = new Map<string, GroupMember>();

  for (const row of rows) {
    const existing = merged.get(row.jid);
    if (!existing) {
      merged.set(row.jid, {
        jid: row.jid,
        rawJids: [row.rawJid],
        name: row.name,
        isAdmin: row.isAdmin === 1,
        isActive: row.isActive === 1,
      });
      continue;
    }
    existing.rawJids.push(row.rawJid);
    existing.name ??= row.name;
    existing.isAdmin ||= row.isAdmin === 1;
    existing.isActive ||= row.isActive === 1;
  }

  return merged;
}

/**
 * Everything one group looks like, in a single response.
 *
 * The rest of the stats surface treats a group as one row with a message count,
 * which says nothing about the thing that makes groups interesting: they are
 * lopsided. A 900-member group is not 900 conversations, it is five people
 * talking and 895 watching, and until now the archive's own roster — who is a
 * member, who is an admin, who has left — was never read at all.
 *
 * Totals come from an exact aggregate; per-participant and per-message figures
 * run over the most recent GROUP_PROFILE_MAX_ROWS, reported in `scan`.
 */
export function getGroupProfile(
  params: { jid?: unknown; limit?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): GroupProfile {
  const jid = firstQueryString(params.jid);
  if (!jid) throw new ChatNotFoundError('');
  const limit = parseLimit(params.limit, 15, 100);
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const now = Math.floor(Date.now() / 1000);
  const hasRoster = tableExists(db, 'group_participants');
  const hasGroupsTable = tableExists(db, 'groups');

  const chat = db.prepare(`
    SELECT
      chats.jid AS jid,
      chats.kind AS kind,
      COALESCE(${cleanDisplayNameSql('chats.name')}, ${cleanDisplayNameSql('chats.jid')}, 'Unknown') AS name
    FROM chats
    WHERE chats.jid = @jid
  `).get({ jid }) as { jid: string; kind: string; name: string } | undefined;

  if (!chat) throw new ChatNotFoundError(jid);
  if (chat.kind !== 'group') throw new NotAGroupError(jid);

  const groupRow = hasGroupsTable
    ? db.prepare(`
        SELECT jid, ${cleanDisplayNameSql('name')} AS name, owner_jid AS ownerJid, created_at AS createdAt
        FROM groups
        WHERE jid = @jid
      `).get({ jid }) as GroupIdentityRow | undefined
    : undefined;

  const totalsRow = db.prepare(`
    SELECT
      COUNT(*) AS messages,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sentByMe,
      SUM(CASE WHEN media_type IS NOT NULL AND media_type <> '' THEN 1 ELSE 0 END) AS media,
      MIN(ts) AS firstTs,
      MAX(ts) AS lastTs,
      COUNT(DISTINCT date(${tsModifierSql(timeZone)})) AS activeDays
    FROM messages
    WHERE chat_jid = @jid
  `).get({ jid }) as GroupTotalsRow;

  const mediaBreakdown = (db.prepare(`
    SELECT media_type AS mediaType, COUNT(*) AS count, COALESCE(SUM(media_size), 0) AS totalBytes
    FROM messages
    WHERE chat_jid = @jid AND media_type IS NOT NULL AND media_type <> ''
    GROUP BY media_type
    ORDER BY count DESC, mediaType ASC
  `).all({ jid }) as MediaBreakdownRow[]).map((row) => ({
    mediaType: row.mediaType,
    count: row.count,
    totalBytes: row.totalBytes ?? 0,
  }));

  // Who spoke, over the whole archive rather than the capped scan: a
  // participant leaderboard that changed depending on how far back the scan
  // reached would be worse than useless.
  const speakers = db.prepare(`
    SELECT
      ${canonicalJidSql('sender_contacts', 'messages.sender_jid')} AS jid,
      ${contactDisplayNameSql('sender_contacts')} AS contactName,
      ${cleanDisplayNameSql('MAX(messages.sender_name)')} AS pushName,
      COUNT(*) AS messageCount,
      MIN(messages.ts) AS firstTs,
      MAX(messages.ts) AS lastTs
    FROM messages
    ${contactLeftJoins('sender_contacts', 'messages.sender_jid')}
    WHERE messages.chat_jid = @jid
      AND messages.from_me = 0
      AND messages.sender_jid IS NOT NULL
      -- Announcements and system events carry the group's own JID as the
      -- sender. They are not a participant and must not rank as the loudest one.
      AND messages.sender_jid <> messages.chat_jid
    GROUP BY 1
    ORDER BY messageCount DESC
  `).all({ jid }) as GroupSpeakerRow[];

  const roster = hasRoster
    ? db.prepare(`
        SELECT
          ${canonicalJidSql('member_contacts', 'group_participants.user_jid')} AS jid,
          group_participants.user_jid AS rawJid,
          COALESCE(
            ${cleanDisplayNameSql('group_participants.contact_name')},
            ${cleanDisplayNameSql('group_participants.first_name')},
            ${contactDisplayNameSql('member_contacts')},
            ${cleanDisplayNameSql('group_participants.user_jid')}
          ) AS name,
          group_participants.is_admin AS isAdmin,
          group_participants.is_active AS isActive
        FROM group_participants
        ${contactLeftJoins('member_contacts', 'group_participants.user_jid')}
        WHERE group_participants.group_jid = @jid
      `).all({ jid }) as GroupRosterRow[]
    : [];

  // My own group messages record the group as their sender, so without this I
  // am a member who has never spoken — the loudest possible lurker.
  const selfJids = hasRoster ? resolveSelfJids(db) : new Set<string>();

  const rosterByJid = mergeRoster(roster);
  const members = [...rosterByJid.values()];
  const spokeJids = new Set(speakers.map((speaker) => speaker.jid).filter((value): value is string => value !== null));
  const activeMembers = members.filter((member) => member.isActive);
  const activeOthers = activeMembers.filter(
    (member) => !member.rawJids.some((raw) => selfJids.has(raw)) && !selfJids.has(member.jid),
  );

  const receivedTotal = speakers.reduce((sum, speaker) => sum + speaker.messageCount, 0);
  const share = (count: number) => (receivedTotal === 0 ? 0 : count / receivedTotal);

  const topParticipants = speakers.slice(0, limit).map((speaker) => {
    const member = speaker.jid ? rosterByJid.get(speaker.jid) : undefined;
    return {
      jid: speaker.jid ?? '',
      // My address book first, then the group's own record of them, then the
      // name they picked for themselves — which in a public group is as likely
      // to be "IAA=" as anything a human would recognise.
      name: speaker.contactName ?? member?.name ?? speaker.pushName ?? speaker.jid ?? 'Unknown',
      // No roster row means they were never recorded as a member, which in
      // practice means they left before the archive first saw the group.
      isAdmin: member?.isAdmin ?? false,
      isActive: member?.isActive ?? false,
      messageCount: speaker.messageCount,
      share: share(speaker.messageCount),
      firstMessageAt: unixSecondsToIso(speaker.firstTs),
      lastMessageAt: unixSecondsToIso(speaker.lastTs),
    };
  });

  const quiet = activeOthers.filter((member) => !spokeJids.has(member.jid));
  // In a public group most members are strangers with no name on record, and a
  // list of fifty identical "Unknown" rows says nothing. Named people first, so
  // the ones the reader can actually act on are the ones they see.
  const quietMembers = quiet
    .slice()
    .sort((a, b) =>
      Number(b.isAdmin) - Number(a.isAdmin)
      || Number(isNamed(b)) - Number(isNamed(a))
      || (a.name ?? '').localeCompare(b.name ?? ''))
    .slice(0, GROUP_QUIET_MEMBER_LIMIT)
    .map((member) => ({ jid: member.jid, name: member.name ?? member.jid, isAdmin: member.isAdmin }));

  const messages = db.prepare(`
    SELECT ts, from_me, text, media_type
    FROM (
      SELECT ts, from_me, text, media_type, rowid
      FROM messages
      WHERE chat_jid = @jid
      ORDER BY ts DESC, rowid DESC
      LIMIT ${GROUP_PROFILE_MAX_ROWS}
    )
    ORDER BY ts ASC, rowid ASC
  `).all({ jid }) as ProfileMessageRow[];

  const monthly = new Map<string, { sent: number; received: number }>();
  const hourCounts = new Array<number>(24).fill(0);
  const wordCounts = new Map<string, number>();
  const emojiCounts = new Map<string, number>();

  for (const message of messages) {
    const month = monthInTimezone(message.ts, timeZone);
    let bucket = monthly.get(month);
    if (!bucket) {
      bucket = { sent: 0, received: 0 };
      monthly.set(month, bucket);
    }
    if (message.from_me) bucket.sent += 1;
    else bucket.received += 1;

    hourCounts[hourInTimezone(message.ts, timeZone)] += 1;

    for (const term of (message.text ?? '').toLowerCase().match(WORD_TOKEN_RE) ?? []) {
      if (isNoiseToken(term)) continue;
      wordCounts.set(term, (wordCounts.get(term) ?? 0) + 1);
    }
    for (const emoji of (message.text ?? '').match(EMOJI_REGEX) ?? []) {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1);
    }
  }

  const ownerJid = groupRow?.ownerJid?.trim() ? groupRow.ownerJid.trim() : null;

  return {
    jid: chat.jid,
    name: groupRow?.name ?? chat.name,
    ownerJid,
    ownerName: ownerJid ? rosterByJid.get(ownerJid)?.name ?? null : null,
    createdAt: unixSecondsToIso(groupRow?.createdAt ?? null),
    hasRoster,
    totals: {
      messages: totalsRow.messages,
      sentByMe: totalsRow.sentByMe ?? 0,
      media: totalsRow.media ?? 0,
      firstMessageAt: unixSecondsToIso(totalsRow.firstTs),
      lastMessageAt: unixSecondsToIso(totalsRow.lastTs),
      daysSinceLastMessage: totalsRow.lastTs == null ? null : Math.floor((now - totalsRow.lastTs) / DAY_SECONDS),
      activeDays: totalsRow.activeDays,
    },
    roster: {
      total: members.length,
      active: activeMembers.length,
      departed: members.length - activeMembers.length,
      others: activeOthers.length,
      // Counted over the same population as speakers and lurkers, so the three
      // figures describe one group of people rather than three different ones.
      admins: activeOthers.filter((member) => member.isAdmin).length,
      speakers: activeOthers.length - quiet.length,
      lurkers: quiet.length,
    },
    topParticipants,
    quietMembers,
    concentration: {
      topOneShare: share(speakers[0]?.messageCount ?? 0),
      topFiveShare: share(speakers.slice(0, 5).reduce((sum, speaker) => sum + speaker.messageCount, 0)),
    },
    monthlyVolume: [...monthly.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, counts]) => ({ month, ...counts })),
    hourOfDay: hourCounts.map((count, hour) => ({ hour, count })).filter((point) => point.count > 0),
    mediaBreakdown,
    topWords: topCounted(wordCounts, limit, (text, value) => ({ text, value })),
    topEmojis: topCounted(emojiCounts, limit, (emoji, count) => ({ emoji, count })),
    scan: scanCoverage(messages.length, GROUP_PROFILE_MAX_ROWS),
  };
}

interface GroupDirectoryRow {
  jid: string;
  name: string | null;
  memberCount: number | null;
  messageCount: number;
  sentByMe: number;
  lastTs: number | null;
  createdAt: number | null;
}

/**
 * Every group, with the roster size the chat list cannot show.
 *
 * `getChats({ kind: 'group' })` already lists groups by recency, but it counts
 * only the people who have spoken. Member count is the number that makes a
 * group legible — 900 members and 40 messages is a very different thing from 6
 * members and 40 messages — and it lives in a table nothing else reads.
 */
export function getGroupDirectory(
  params: { limit?: unknown; sort?: unknown },
  db: Database = getDb(),
): GroupDirectoryEntry[] {
  const limit = parseLimit(params.limit, 50, 500);
  const sort = params.sort === 'members' || params.sort === 'messages' ? params.sort : 'recent';
  const hasRoster = tableExists(db, 'group_participants');
  const hasGroupsTable = tableExists(db, 'groups');

  const orderBy = sort === 'members'
    ? 'memberCount DESC NULLS LAST, messageCount DESC'
    : sort === 'messages'
      ? 'messageCount DESC'
      : 'COALESCE(lastTs, 0) DESC';

  const rows = db.prepare(`
    SELECT
      chats.jid AS jid,
      COALESCE(
        ${hasGroupsTable ? `${cleanDisplayNameSql('groups.name')},` : ''}
        ${cleanDisplayNameSql('chats.name')},
        ${cleanDisplayNameSql('MAX(messages.chat_name)')},
        ${cleanDisplayNameSql('chats.jid')},
        'Unknown'
      ) AS name,
      ${hasRoster
        // DISTINCT because the same person can hold both a LID row and a stale
        // phone row; counting rows inflates a 14-person group to 27.
        ? `(
            SELECT COUNT(DISTINCT ${canonicalJidSql('roster_contacts', 'group_participants.user_jid')})
            FROM group_participants
            ${contactLeftJoins('roster_contacts', 'group_participants.user_jid')}
            WHERE group_participants.group_jid = chats.jid AND group_participants.is_active = 1
          )`
        : 'NULL'} AS memberCount,
      COUNT(messages.rowid) AS messageCount,
      COALESCE(SUM(messages.from_me), 0) AS sentByMe,
      MAX(messages.ts) AS lastTs,
      ${hasGroupsTable ? 'groups.created_at' : 'NULL'} AS createdAt
    FROM chats
    ${hasGroupsTable ? 'LEFT JOIN groups ON groups.jid = chats.jid' : ''}
    LEFT JOIN messages ON messages.chat_jid = chats.jid
    WHERE chats.kind = 'group'
    GROUP BY chats.jid
    ORDER BY ${orderBy}
    LIMIT @limit
  `).all({ limit }) as GroupDirectoryRow[];

  return rows.map((row) => ({
    jid: row.jid,
    name: row.name ?? row.jid,
    memberCount: row.memberCount,
    messageCount: row.messageCount,
    sentByMe: row.sentByMe,
    lastMessageAt: unixSecondsToIso(row.lastTs),
    createdAt: unixSecondsToIso(row.createdAt),
  }));
}

interface DormancyRow {
  jid: string;
  name: string | null;
  baselineCount: number;
  recentCount: number;
  lastTs: number;
}

/**
 * Contacts who used to be part of the daily traffic and are not any more.
 *
 * Ghost Score answers "who ignores me"; this answers "who did I drift away
 * from", which is the question with something to do about it. The comparison is
 * per-month rather than raw counts so the two windows can be different lengths.
 */
export function getDormancy(
  params: {
    limit?: unknown;
    baselineDays?: unknown;
    recentDays?: unknown;
    minBaselineMessages?: unknown;
    kind?: unknown;
  },
  db: Database = getDb(),
): DormancyReport {
  const limit = parseLimit(params.limit, 10, 50);
  const recentDays = parseLimit(params.recentDays, 90, 3650);
  const baselineDays = Math.max(parseLimit(params.baselineDays, 730, 36_500), recentDays + 1);
  const minBaselineMessages = parseLimit(params.minBaselineMessages, 20, 100_000);
  const kind = parseChatKind(params.kind, 'direct');
  const kindFilter = `AND ${chatKindSql(kind)}`;

  const now = Math.floor(Date.now() / 1000);
  const recentStart = now - recentDays * DAY_SECONDS;
  const baselineStart = now - baselineDays * DAY_SECONDS;

  const rows = db.prepare(`
    SELECT
      chats.jid AS jid,
      COALESCE(
        ${cleanDisplayNameSql('chats.name')},
        ${cleanDisplayNameSql('MAX(messages.chat_name)')},
        ${contactDisplayNameSql('chat_contacts')},
        ${cleanDisplayNameSql('chats.jid')},
        'Unknown'
      ) AS name,
      SUM(CASE WHEN messages.ts < @recentStart THEN 1 ELSE 0 END) AS baselineCount,
      SUM(CASE WHEN messages.ts >= @recentStart THEN 1 ELSE 0 END) AS recentCount,
      MAX(messages.ts) AS lastTs
    FROM chats
    JOIN messages ON messages.chat_jid = chats.jid
    ${contactLeftJoins('chat_contacts', 'chats.jid')}
    WHERE messages.ts >= @baselineStart
      ${kindFilter}
    GROUP BY chats.jid
    HAVING baselineCount >= @minBaselineMessages
  `).all({ recentStart, baselineStart, minBaselineMessages }) as DormancyRow[];

  const baselineMonths = (baselineDays - recentDays) / DAYS_PER_MONTH;
  const recentMonths = recentDays / DAYS_PER_MONTH;
  const round2 = (value: number) => Math.round(value * 100) / 100;

  const contacts = rows
    .map((row) => {
      const baselinePerMonth = row.baselineCount / baselineMonths;
      const recentPerMonth = row.recentCount / recentMonths;
      return {
        jid: row.jid,
        name: row.name ?? row.jid,
        baselineCount: row.baselineCount,
        baselinePerMonth: round2(baselinePerMonth),
        recentCount: row.recentCount,
        recentPerMonth: round2(recentPerMonth),
        dropRatio: round2(1 - recentPerMonth / baselinePerMonth),
        lastMessageAt: unixSecondsToIso(row.lastTs),
        daysSinceLastMessage: Math.floor((now - row.lastTs) / DAY_SECONDS),
      };
    })
    // A chat that held steady or grew is not dormant, whatever its volume.
    .filter((contact) => contact.dropRatio > 0)
    .sort((a, b) => b.dropRatio - a.dropRatio || b.baselinePerMonth - a.baselinePerMonth)
    .slice(0, limit);

  return { baselineDays, recentDays, minBaselineMessages, contacts };
}

/** Text messages of one year scanned for words and emoji. */
const YEAR_IN_REVIEW_MAX_ROWS = 60_000;

/** Longest run of consecutive dates in an ascending list of YYYY-MM-DD strings. */
function longestConsecutiveRun(dates: string[]): number {
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const date of dates) {
    const time = Date.parse(`${date}T00:00:00.000Z`);
    run = previous != null && time - previous === DAY_SECONDS * 1000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = time;
  }
  return longest;
}

/**
 * One calendar year assembled into a single page.
 *
 * Everything here exists elsewhere as a rolling-window leaderboard; what is
 * missing is the ability to ask about a specific year, which only the heatmap
 * could do and only for its own cell counts.
 */
export function getYearInReview(
  params: { year?: unknown; limit?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): YearInReview {
  const year = parseYear(params.year);
  const limit = parseLimit(params.limit, 10, 50);
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const bounds = yearBounds(year, timeZone);
  const previousBounds = yearBounds(year - 1, timeZone);
  const tsSql = tsModifierSql(timeZone);

  const totalsRow = db.prepare(`
    SELECT
      COUNT(*) AS messages,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN media_type IS NOT NULL AND media_type <> '' THEN 1 ELSE 0 END) AS media,
      COUNT(DISTINCT chat_jid) AS chats
    FROM messages
    WHERE ts >= @start AND ts < @end
  `).get(bounds) as { messages: number; sent: number | null; media: number | null; chats: number };

  const dailyRows = db.prepare(`
    SELECT date(${tsSql}) AS date, COUNT(*) AS count
    FROM messages
    WHERE ts >= @start AND ts < @end
    GROUP BY date
    ORDER BY date ASC
  `).all(bounds) as ActivityHeatmapRow[];

  const monthlyRows = db.prepare(`
    SELECT
      strftime('%Y-%m', ${tsSql}) AS month,
      SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) AS received
    FROM messages
    WHERE ts >= @start AND ts < @end
    GROUP BY month
    ORDER BY month ASC
  `).all(bounds) as Array<{ month: string; sent: number | null; received: number | null }>;

  const hourRows = db.prepare(`
    SELECT CAST(strftime('%H', ${tsSql}) AS INTEGER) AS hour, COUNT(*) AS count
    FROM messages
    WHERE ts >= @start AND ts < @end
    GROUP BY hour
    ORDER BY hour ASC
  `).all(bounds) as HourOfDayStat[];

  const topChats = (db.prepare(`
    SELECT
      chats.jid AS jid,
      chats.kind AS kind,
      COALESCE(
        ${cleanDisplayNameSql('chats.name')},
        ${cleanDisplayNameSql('MAX(messages.chat_name)')},
        ${contactDisplayNameSql('chat_contacts')},
        ${cleanDisplayNameSql('chats.jid')},
        'Unknown'
      ) AS name,
      COUNT(*) AS messageCount
    FROM messages
    JOIN chats ON chats.jid = messages.chat_jid
    ${contactLeftJoins('chat_contacts', 'chats.jid')}
    WHERE messages.ts >= @start AND messages.ts < @end
    GROUP BY chats.jid
    ORDER BY messageCount DESC, name COLLATE NOCASE ASC
    LIMIT @limit
  `).all({ ...bounds, limit }) as Array<YearChatStat & { name: string | null }>)
    .map((row) => ({ ...row, name: row.name ?? row.jid }));

  // "New" means the first message ever in that chat, not the first this year,
  // so a contact revived after a long gap is not miscounted as a new one.
  const newContacts = (db.prepare(`
    SELECT
      first_seen.chat_jid AS jid,
      COALESCE(
        ${cleanDisplayNameSql('chats.name')},
        ${contactDisplayNameSql('chat_contacts')},
        ${cleanDisplayNameSql('first_seen.chat_jid')},
        'Unknown'
      ) AS name,
      first_seen.firstTs AS firstTs,
      first_seen.yearCount AS messageCount
    FROM (
      SELECT
        chat_jid,
        MIN(ts) AS firstTs,
        SUM(CASE WHEN ts >= @start AND ts < @end THEN 1 ELSE 0 END) AS yearCount
      FROM messages
      GROUP BY chat_jid
    ) first_seen
    LEFT JOIN chats ON chats.jid = first_seen.chat_jid
    ${contactLeftJoins('chat_contacts', 'first_seen.chat_jid')}
    WHERE first_seen.firstTs >= @start AND first_seen.firstTs < @end
    ORDER BY messageCount DESC, firstTs ASC
    LIMIT @limit
  `).all({ ...bounds, limit }) as Array<{ jid: string; name: string | null; firstTs: number; messageCount: number }>)
    .map((row) => ({
      jid: row.jid,
      name: row.name ?? row.jid,
      firstMessageAt: unixSecondsToIso(row.firstTs) ?? '',
      messageCount: row.messageCount,
    }));

  const mediaBreakdown = (db.prepare(`
    SELECT media_type AS mediaType, COUNT(*) AS count, COALESCE(SUM(media_size), 0) AS totalBytes
    FROM messages
    WHERE ts >= @start AND ts < @end AND media_type IS NOT NULL AND media_type <> ''
    GROUP BY media_type
    ORDER BY count DESC, mediaType ASC
  `).all(bounds) as MediaBreakdownRow[]).map((row) => ({
    mediaType: row.mediaType,
    count: row.count,
    totalBytes: row.totalBytes ?? 0,
  }));

  const textRows = db.prepare(`
    SELECT text
    FROM messages
    WHERE ts >= @start AND ts < @end AND text IS NOT NULL AND TRIM(text) <> ''
    ORDER BY ts DESC
    LIMIT ${YEAR_IN_REVIEW_MAX_ROWS}
  `).all(bounds) as TextRow[];

  const wordCounts = new Map<string, number>();
  const emojiCounts = new Map<string, number>();
  for (const row of textRows) {
    const text = row.text ?? '';
    for (const term of text.toLowerCase().match(WORD_TOKEN_RE) ?? []) {
      if (isNoiseToken(term)) continue;
      wordCounts.set(term, (wordCounts.get(term) ?? 0) + 1);
    }
    for (const emoji of text.match(EMOJI_REGEX) ?? []) {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1);
    }
  }

  const previousCount = (db.prepare(`
    SELECT COUNT(*) AS count FROM messages WHERE ts >= @start AND ts < @end
  `).get(previousBounds) as CountRow).count;

  const monthlyVolume = monthlyRows.map((row) => ({
    month: row.month,
    sent: row.sent ?? 0,
    received: row.received ?? 0,
  }));

  const busiestDay = dailyRows.reduce<ActivityHeatmapRow | null>(
    (best, row) => (best === null || row.count > best.count ? row : best),
    null,
  );
  const busiestMonth = monthlyVolume.reduce<{ month: string; count: number } | null>((best, row) => {
    const count = row.sent + row.received;
    return best === null || count > best.count ? { month: row.month, count } : best;
  }, null);

  return {
    year,
    totals: {
      messages: totalsRow.messages,
      sent: totalsRow.sent ?? 0,
      received: totalsRow.messages - (totalsRow.sent ?? 0),
      media: totalsRow.media ?? 0,
      chats: totalsRow.chats,
      activeDays: dailyRows.length,
    },
    busiestDay,
    busiestMonth,
    longestStreakDays: longestConsecutiveRun(dailyRows.map((row) => row.date)),
    monthlyVolume,
    hourOfDay: hourRows.filter((row) => row.count > 0),
    topChats,
    newContacts,
    topWords: topCounted(wordCounts, limit, (text, value) => ({ text, value })),
    topEmojis: topCounted(emojiCounts, limit, (emoji, count) => ({ emoji, count })),
    mediaBreakdown,
    previousYear: previousCount === 0
      ? null
      : {
          messages: previousCount,
          changeRatio: Math.round(((totalsRow.messages - previousCount) / previousCount) * 100) / 100,
        },
    scan: scanCoverage(textRows.length, YEAR_IN_REVIEW_MAX_ROWS),
  };
}

/** Backstop on rows pulled into memory after the link/media prefilter. */
const LINK_INTELLIGENCE_MAX_ROWS = 100_000;

interface LinkMessageRow {
  text: string | null;
  ts: number;
  from_me: number;
  jid: string | null;
  name: string | null;
  contact_name: string | null;
  media_type: string | null;
}

interface FirstSharedRow {
  chat_jid: string;
  chat_name: string | null;
  contact_name: string | null;
  first_text: string | null;
  first_ts: number;
  first_media_type: string | null;
  first_media_ts: number | null;
}

export function getLinkIntelligence(
  params: { period?: unknown; limit?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): LinkIntelligence {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 15, 50);
  const timeZone = resolveStatsTimeZone(params.timeZone);

  // Only messages that carry a link or media can contribute to any output below,
  // so the prefilter is lossless: extractUrls only matches http(s):// URLs, and
  // SQLite LIKE is case-insensitive for ASCII. It keeps the joins — and the row
  // materialization — off the (typically large) majority of plain-text messages.
  const rows = db.prepare(`
    SELECT text, ts, from_me, media_type, jid, name, contact_name
    FROM (
      SELECT
        messages.rowid,
        messages.text,
        messages.ts,
        messages.from_me,
        messages.media_type,
        CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END AS jid,
        ${cleanDisplayNameSql(`CASE WHEN messages.from_me = 1 THEN COALESCE(chats.name, messages.chat_name) ELSE messages.sender_name END`)} AS name,
        ${contactDisplayNameSql('contacts')} AS contact_name
      FROM messages
      LEFT JOIN chats ON chats.jid = CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END
      ${contactLeftJoins('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')}
      WHERE messages.ts >= @since
        AND (
          messages.text LIKE '%http%'
          OR (messages.media_type IS NOT NULL AND messages.media_type <> '')
        )
      ORDER BY messages.ts DESC, messages.rowid DESC
      LIMIT ${LINK_INTELLIGENCE_MAX_ROWS}
    )
    ORDER BY ts ASC, rowid ASC
  `).all({ since }) as LinkMessageRow[];

  const domainCounts = new Map<string, number>();
  const contactLinks = new Map<string, { name: string; sent: number; received: number }>();
  const contactMedia = new Map<string, { name: string; mediaSent: number; mediaReceived: number }>();
  const timelineBuckets = new Map<string, { images: number; videos: number; audio: number; links: number }>();
  let totalLinks = 0;

  // Single pass: the leaderboard, the timeline and the asymmetry table all read
  // the same rows, and extracting URLs twice per row was the dominant cost here.
  for (const row of rows) {
    const urls = extractUrls(row.text);
    const mediaType = row.media_type?.toLowerCase() ?? '';
    const isTimelineMedia = mediaType === 'image' || mediaType === 'video' || mediaType === 'audio';
    if (urls.length === 0 && !mediaType) continue;

    const jid = row.jid ?? 'unknown';
    const displayName = row.name ?? row.contact_name ?? jid;

    if (urls.length > 0) {
      totalLinks += urls.length;

      if (!contactLinks.has(jid)) {
        contactLinks.set(jid, { name: displayName, sent: 0, received: 0 });
      }
      const entry = contactLinks.get(jid)!;
      if (row.from_me) {
        entry.sent += urls.length;
      } else {
        entry.received += urls.length;
      }

      for (const url of urls) {
        const domain = parseDomain(url);
        if (domain) {
          domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
        }
      }
    }

    if (mediaType) {
      if (!contactMedia.has(jid)) {
        contactMedia.set(jid, { name: displayName, mediaSent: 0, mediaReceived: 0 });
      }
      const entry = contactMedia.get(jid)!;
      if (row.from_me) entry.mediaSent++;
      else entry.mediaReceived++;
    }

    if (urls.length > 0 || isTimelineMedia) {
      const date = dateInTimezone(row.ts, timeZone);
      let bucket = timelineBuckets.get(date);
      if (!bucket) {
        bucket = { images: 0, videos: 0, audio: 0, links: 0 };
        timelineBuckets.set(date, bucket);
      }
      if (mediaType === 'image') bucket.images++;
      else if (mediaType === 'video') bucket.videos++;
      else if (mediaType === 'audio') bucket.audio++;
      bucket.links += urls.length;
    }
  }

  // --- Domain leaderboard + categories ---
  const domainLeaderboard: LinkDomainStat[] = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count, category: categorizeDomain(domain) }));

  const uniqueDomains = domainCounts.size;

  // --- Link categories ---
  const catCounts = new Map<string, { count: number; domains: Map<string, number> }>();
  for (const [domain, count] of domainCounts) {
    const cat = categorizeDomain(domain);
    if (!catCounts.has(cat)) {
      catCounts.set(cat, { count: 0, domains: new Map() });
    }
    const catEntry = catCounts.get(cat)!;
    catEntry.count += count;
    catEntry.domains.set(domain, (catEntry.domains.get(domain) ?? 0) + count);
  }

  const linkCategories: LinkCategoryStat[] = [...catCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([category, { count, domains }]) => {
      const topDomain = [...domains.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return { category: category as LinkCategoryStat['category'], count, topDomain };
    });

  // --- Media timeline density ---
  const mediaTimeline: MediaTimelinePoint[] = [...timelineBuckets.entries()]
    .filter(([, b]) => b.images + b.videos + b.audio + b.links > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, b]) => ({ date, ...b }));

  // --- Sharing asymmetry ---
  const sharingAsymmetry: SharingAsymmetryStat[] = [...new Set([...contactMedia.keys(), ...contactLinks.keys()])]
    .map((jid) => {
      const media = contactMedia.get(jid) ?? { name: jid, mediaSent: 0, mediaReceived: 0 };
      const links = contactLinks.get(jid) ?? { name: jid, sent: 0, received: 0 };
      const name = media.name !== jid ? media.name : links.name;
      return {
        jid,
        name,
        mediaSent: media.mediaSent,
        mediaReceived: media.mediaReceived,
        linksSent: links.sent,
        linksReceived: links.received,
      };
    })
    .filter((s) => s.mediaSent + s.mediaReceived + s.linksSent + s.linksReceived > 0)
    .sort((a, b) => (b.mediaSent + b.mediaReceived + b.linksSent + b.linksReceived) - (a.mediaSent + a.mediaReceived + a.linksSent + a.linksReceived))
    .slice(0, limit);

  // --- First shared per contact ---
  const firstSharedRows = db.prepare(`
    SELECT
      m.chat_jid,
      ${cleanDisplayNameSql('COALESCE(chats.name, first_msg.chat_name)')} AS chat_name,
      ${contactDisplayNameSql('fcontacts')} AS contact_name,
      first_msg.text AS first_text,
      first_msg.ts AS first_ts,
      first_media.media_type AS first_media_type,
      first_media.ts AS first_media_ts
    FROM (
      SELECT chat_jid, MIN(rowid) AS first_rowid
      FROM messages
      WHERE ts >= @since
      GROUP BY chat_jid
    ) m
    LEFT JOIN messages first_msg ON first_msg.rowid = m.first_rowid
    LEFT JOIN chats ON chats.jid = m.chat_jid
    ${contactLeftJoins('fcontacts', 'm.chat_jid')}
    LEFT JOIN (
      SELECT chat_jid, MIN(rowid) AS media_rowid
      FROM messages
      WHERE ts >= @since AND media_type IS NOT NULL AND media_type <> ''
      GROUP BY chat_jid
    ) fm ON fm.chat_jid = m.chat_jid
    LEFT JOIN messages first_media ON first_media.rowid = fm.media_rowid
    ORDER BY first_msg.ts ASC
    LIMIT @limit
  `).all({ since, limit }) as FirstSharedRow[];

  const firstShared: FirstSharedStat[] = firstSharedRows.map((row) => ({
    jid: row.chat_jid,
    name: row.chat_name ?? row.contact_name ?? row.chat_jid,
    firstMessageText: row.first_text,
    firstMessageDate: unixSecondsToIso(row.first_ts) ?? new Date(0).toISOString(),
    firstMediaType: row.first_media_type,
    firstMediaDate: row.first_media_ts ? unixSecondsToIso(row.first_media_ts) : null,
  }));

  return {
    domainLeaderboard,
    mediaTimeline,
    sharingAsymmetry,
    linkCategories,
    firstShared,
    totalLinks,
    uniqueDomains,
    scan: scanCoverage(rows.length, LINK_INTELLIGENCE_MAX_ROWS),
  };
}

/**
 * Hour × weekday grid: the week's rhythm as one picture.
 *
 * Hour-of-day and day-of-week each flatten the other axis away, so "Sunday
 * night" and "Tuesday lunch" never show up as the peaks they are.
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

/** Messages scanned for distinctive words; the newest ones, when the archive is larger. */
const DISTINCTIVE_WORDS_MAX_ROWS = 60_000;

/** A word must turn up this often on its own side before it can represent it. */
const DISTINCTIVE_MIN_SIDE_COUNT = 3;

/** |z| above this is the conventional 95% line; below it the lean is noise. */
const DISTINCTIVE_MIN_Z = 1.96;

/**
 * Words that are characteristically yours, and characteristically everyone else's.
 *
 * Raw frequency — what the word cloud shows — ranks the words everybody uses.
 * This ranks by weighted log-odds with an informative Dirichlet prior
 * (Monroe, Colaresi & Quinn 2008, "Fightin' Words"), using the pooled counts as
 * the prior. The prior shrinks rare words towards "no preference", so a word you
 * used twice cannot outrank one you used two hundred times more than anyone else.
 */
export function getDistinctiveWords(
  params: { period?: unknown; limit?: unknown },
  db: Database = getDb(),
): DistinctiveWords {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 12, 50);
  const rows = db.prepare(`
    SELECT text, from_me
    FROM messages
    WHERE ts >= @since AND text IS NOT NULL AND TRIM(text) <> ''
    ORDER BY ts DESC
    LIMIT ${DISTINCTIVE_WORDS_MAX_ROWS}
  `).all({ since }) as Array<{ text: string; from_me: number }>;

  const mineCounts = new Map<string, number>();
  const theirCounts = new Map<string, number>();
  let mineTotal = 0;
  let theirTotal = 0;
  for (const row of rows) {
    const counts = row.from_me ? mineCounts : theirCounts;
    for (const term of row.text.toLowerCase().match(WORD_TOKEN_RE) ?? []) {
      if (isNoiseToken(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
      if (row.from_me) mineTotal += 1;
      else theirTotal += 1;
    }
  }

  const scan = scanCoverage(rows.length, DISTINCTIVE_WORDS_MAX_ROWS);
  // With one side silent there is nothing to contrast against.
  if (mineTotal === 0 || theirTotal === 0) return { mine: [], theirs: [], scan };

  const priorTotal = mineTotal + theirTotal;
  const scored: DistinctiveTerm[] = [];
  for (const text of new Set([...mineCounts.keys(), ...theirCounts.keys()])) {
    const mine = mineCounts.get(text) ?? 0;
    const theirs = theirCounts.get(text) ?? 0;
    const prior = mine + theirs;
    const delta = Math.log((mine + prior) / (mineTotal + priorTotal - mine - prior))
      - Math.log((theirs + prior) / (theirTotal + priorTotal - theirs - prior));
    const variance = 1 / (mine + prior) + 1 / (theirs + prior);
    scored.push({ text, mine, theirs, score: Math.round((delta / Math.sqrt(variance)) * 100) / 100 });
  }

  const byText = (a: DistinctiveTerm, b: DistinctiveTerm) => a.text.localeCompare(b.text);
  return {
    mine: scored
      .filter((term) => term.score >= DISTINCTIVE_MIN_Z && term.mine >= DISTINCTIVE_MIN_SIDE_COUNT)
      .sort((a, b) => b.score - a.score || byText(a, b))
      .slice(0, limit),
    theirs: scored
      .filter((term) => term.score <= -DISTINCTIVE_MIN_Z && term.theirs >= DISTINCTIVE_MIN_SIDE_COUNT)
      .sort((a, b) => a.score - b.score || byText(a, b))
      .slice(0, limit),
    scan,
  };
}

interface GroupLifecycleRow {
  jid: string;
  name: string | null;
  messageCount: number;
  lastTs: number | null;
  createdAt: number | null;
}

/**
 * How groups age, and how many of them have quietly died.
 *
 * "Last activity" takes the later of the newest archived message and the chat's
 * own `last_message_at`, so a group whose history was only partly imported is
 * not buried on the strength of the part that is missing.
 */
export function getGroupLifecycle(
  params: { dormantDays?: unknown; limit?: unknown; timeZone?: unknown },
  db: Database = getDb(),
): GroupLifecycle {
  const dormantDays = parseLimit(params.dormantDays, 180, 3650);
  const limit = parseLimit(params.limit, 8, 50);
  const timeZone = resolveStatsTimeZone(params.timeZone);
  const hasGroupsTable = tableExists(db, 'groups');

  const rows = db.prepare(`
    SELECT
      chats.jid AS jid,
      COALESCE(
        ${hasGroupsTable ? `${cleanDisplayNameSql('groups.name')},` : ''}
        ${cleanDisplayNameSql('chats.name')},
        ${cleanDisplayNameSql('MAX(messages.chat_name)')},
        ${cleanDisplayNameSql('chats.jid')},
        'Unknown'
      ) AS name,
      COUNT(messages.rowid) AS messageCount,
      NULLIF(MAX(COALESCE(MAX(messages.ts), 0), COALESCE(chats.last_message_at, 0)), 0) AS lastTs,
      ${hasGroupsTable ? 'NULLIF(groups.created_at, 0)' : 'NULL'} AS createdAt
    FROM chats
    ${hasGroupsTable ? 'LEFT JOIN groups ON groups.jid = chats.jid' : ''}
    LEFT JOIN messages ON messages.chat_jid = chats.jid
    WHERE chats.kind = 'group'
    GROUP BY chats.jid
  `).all() as GroupLifecycleRow[];

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - dormantDays * DAY_SECONDS;
  const toEntry = (row: GroupLifecycleRow): GroupGraveyardEntry => ({
    jid: row.jid,
    name: row.name ?? row.jid,
    messageCount: row.messageCount,
    createdAt: unixSecondsToIso(row.createdAt),
    lastMessageAt: unixSecondsToIso(row.lastTs),
    daysSilent: row.lastTs == null ? null : Math.floor((now - row.lastTs) / DAY_SECONDS),
  });
  const isDead = (row: GroupLifecycleRow) => row.lastTs == null || row.lastTs < cutoff;

  const dead = rows.filter(isDead);
  const alive = rows.filter((row) => !isDead(row));

  const ages = rows
    .filter((row) => row.createdAt != null && row.createdAt <= now)
    .map((row) => (now - (row.createdAt as number)) / DAY_SECONDS)
    .sort((a, b) => a - b);

  const oldestAliveRow = alive
    .filter((row) => row.createdAt != null)
    .sort((a, b) => (a.createdAt as number) - (b.createdAt as number))[0];

  const byYear = new Map<number, GroupFoundingYear>();
  for (const row of rows) {
    if (row.createdAt == null) continue;
    const year = Number(dateInTimezone(row.createdAt, timeZone).slice(0, 4));
    const bucket = byYear.get(year) ?? { year, alive: 0, dead: 0 };
    if (isDead(row)) bucket.dead += 1;
    else bucket.alive += 1;
    byYear.set(year, bucket);
  }

  return {
    dormantDays,
    totalGroups: rows.length,
    deadGroups: dead.length,
    neverActiveGroups: dead.filter((row) => row.messageCount === 0).length,
    medianAgeDays: ages.length ? Math.round(percentile(ages, 50)) : null,
    oldestAlive: oldestAliveRow ? toEntry(oldestAliveRow) : null,
    foundedByYear: [...byYear.values()].sort((a, b) => a.year - b.year),
    // Groups with no archived message have no history to mourn.
    graveyard: dead
      .filter((row) => row.messageCount > 0)
      .sort((a, b) => b.messageCount - a.messageCount || (b.lastTs ?? 0) - (a.lastTs ?? 0))
      .slice(0, limit)
      .map(toEntry),
  };
}

interface BuriedChatRow {
  jid: string;
  kind: string;
  name: string | null;
  recentMessages: number;
  recentFromMe: number;
  lastTs: number | null;
}

/**
 * Chats you archived that did not stay archived in spirit.
 *
 * WhatsApp un-archives a chat when a message lands unless "Keep chats archived"
 * is on, so on most accounts this list is the set of conversations the user
 * explicitly asked to stop seeing — and that kept going regardless.
 */
export function getArchivedChats(
  params: { windowDays?: unknown; limit?: unknown },
  db: Database = getDb(),
): ArchivedChats {
  const windowDays = parseLimit(params.windowDays, 30, 3650);
  const limit = parseLimit(params.limit, 8, 50);

  if (!columnExists(db, 'chats', 'archived')) {
    return {
      available: false,
      windowDays,
      totalChats: 0,
      archivedChats: 0,
      archivedDirect: 0,
      archivedGroups: 0,
      stillActiveCount: 0,
      stillActive: [],
    };
  }

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS totalChats,
      COALESCE(SUM(archived <> 0), 0) AS archivedChats,
      COALESCE(SUM(archived <> 0 AND ${chatKindSql('direct', 'kind')}), 0) AS archivedDirect,
      COALESCE(SUM(archived <> 0 AND ${chatKindSql('group', 'kind')}), 0) AS archivedGroups
    FROM chats
    WHERE ${chatKindSql('all', 'kind')}
  `).get() as { totalChats: number; archivedChats: number; archivedDirect: number; archivedGroups: number };

  const since = Math.floor(Date.now() / 1000) - windowDays * DAY_SECONDS;
  const rows = db.prepare(`
    SELECT
      chats.jid AS jid,
      chats.kind AS kind,
      COALESCE(
        ${cleanDisplayNameSql('chats.name')},
        ${cleanDisplayNameSql('MAX(messages.chat_name)')},
        ${contactDisplayNameSql('chat_contacts')},
        ${cleanDisplayNameSql('chats.jid')},
        'Unknown'
      ) AS name,
      COUNT(messages.rowid) AS recentMessages,
      COALESCE(SUM(messages.from_me), 0) AS recentFromMe,
      MAX(messages.ts) AS lastTs
    FROM chats
    JOIN messages ON messages.chat_jid = chats.jid AND messages.ts >= @since
    ${contactLeftJoins('chat_contacts', 'chats.jid')}
    WHERE chats.archived <> 0 AND ${chatKindSql('all')}
    GROUP BY chats.jid
    ORDER BY recentMessages DESC, lastTs DESC
  `).all({ since }) as BuriedChatRow[];

  return {
    available: true,
    windowDays,
    ...totals,
    stillActiveCount: rows.length,
    stillActive: rows.slice(0, limit).map((row) => ({
      jid: row.jid,
      name: row.name ?? row.jid,
      kind: row.kind === 'group' ? 'group' : 'direct',
      recentMessages: row.recentMessages,
      recentFromMe: row.recentFromMe,
      lastMessageAt: unixSecondsToIso(row.lastTs),
    })),
  };
}

export const statsRouter = Router();

/**
 * Wrap a stats query in the archive-fingerprinted cache.
 *
 * Every one of these aggregations is expensive and better-sqlite3 is synchronous,
 * so an uncached dashboard load blocks the event loop once per chart. Repeat loads
 * and period toggles now hit memory, and conditional requests short-circuit to 304
 * before the query runs at all.
 */
function cachedStats<T>(route: string, compute: (query: Request['query']) => T): RequestHandler {
  return (req, res) => {
    const key = statsCacheKey(route, req.query as Record<string, unknown>);
    const etag = etagFor(key);

    // no-cache = revalidate every time, so a re-synced archive is picked up
    // immediately; revalidation itself never touches SQLite.
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

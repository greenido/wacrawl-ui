import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.js';
import { cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins } from '../lib/displayName.js';
import {
  bucketDateSql,
  normalizeBucketDate,
  parseGranularity,
  parseLimit,
  parsePeriod,
  parseYear,
  sinceTimestamp,
  unixSecondsToIso,
  yearBounds,
} from '../lib/query.js';
import { hourInTimezone, resolveStatsTimeZone } from '../lib/timezone.js';
import { USEFUL_WORD_STOP_SET } from '../lib/wordCloudUsefulStopWords.js';
import { categorizeDomain, extractUrls, parseDomain } from '../lib/urlExtract.js';
import type {
  ActivityHeatmapPoint,
  ConversationDynamics,
  ConversationDepthStat,
  DayOfWeekStat,
  EmojiAnalytics,
  EmojiContactStat,
  EmojiStat,
  FirstSharedStat,
  GhostScoreStat,
  GroupActivityStat,
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
  ResponseTimeStat,
  SentReceivedRatioPoint,
  SharingAsymmetryStat,
  TopContact,
  WordCloudTerm,
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

interface ResponseTimeRow {
  jid: string;
  name: string | null;
  responseCount: number;
  averageSeconds: number;
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
  params: { period?: unknown; granularity?: unknown },
  db: Database = getDb(),
): MessageVolumePoint[] {
  const period = parsePeriod(params.period);
  const fallbackGranularity = period === 'year' || period === 'all' ? 'month' : 'day';
  const granularity = parseGranularity(params.granularity, fallbackGranularity);
  const since = sinceTimestamp(period);
  const bucketSql = bucketDateSql(granularity);

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

export function getActivityHeatmap(params: { year?: unknown }, db: Database = getDb()): ActivityHeatmapPoint[] {
  const year = parseYear(params.year);
  const bounds = yearBounds(year);

  return db.prepare(`
    SELECT date(ts, 'unixepoch') AS date, COUNT(*) AS count
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

export function getDayOfWeekStats(params: { period?: unknown }, db: Database = getDb()): DayOfWeekStat[] {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = db.prepare(`
    SELECT strftime('%w', ts, 'unixepoch') AS day, COUNT(*) AS count
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

export function getSentReceivedRatio(params: { period?: unknown }, db: Database = getDb()): SentReceivedRatioPoint[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-01', ts, 'unixepoch') AS month,
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

export function getResponseTimes(params: { period?: unknown; limit?: unknown }, db: Database = getDb()): ResponseTimeStat[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 10, 50);
  const rows = db.prepare(`
    WITH ordered AS (
      SELECT
        chat_jid,
        chat_name,
        ts,
        from_me,
        LAG(ts) OVER (PARTITION BY chat_jid ORDER BY ts, rowid) AS previous_ts,
        LAG(from_me) OVER (PARTITION BY chat_jid ORDER BY ts, rowid) AS previous_from_me
      FROM messages
      WHERE ts >= @since
    )
    SELECT
      chat_jid AS jid,
      COALESCE(${cleanDisplayNameSql('MAX(chats.name)')}, ${cleanDisplayNameSql('MAX(chat_name)')}, ${contactDisplayNameSql('chat_contacts')}, ${cleanDisplayNameSql('chat_jid')}, 'Unknown') AS name,
      COUNT(*) AS responseCount,
      ROUND(AVG(ts - previous_ts)) AS averageSeconds
    FROM ordered
    LEFT JOIN chats ON chats.jid = ordered.chat_jid
    ${contactLeftJoins('chat_contacts', 'ordered.chat_jid')}
    WHERE previous_ts IS NOT NULL
      AND previous_from_me IS NOT NULL
      AND previous_from_me <> from_me
      AND ts > previous_ts
    GROUP BY chat_jid
    ORDER BY averageSeconds ASC
    LIMIT @limit
  `).all({ since, limit }) as ResponseTimeRow[];

  return rows.map((row) => ({
    jid: row.jid,
    name: row.name ?? row.jid,
    responseCount: row.responseCount,
    averageSeconds: row.averageSeconds ?? 0,
  }));
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

export function getMessageStreaks(params: { period?: unknown }, db: Database = getDb()): MessageStreaks {
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = db.prepare(`
    SELECT DISTINCT date(ts, 'unixepoch') AS date
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

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const lastTime = rows.length ? Date.parse(`${rows[rows.length - 1].date}T00:00:00.000Z`) : null;
  const currentStreak = lastTime != null && todayUtc - lastTime <= 86_400_000 ? activeRun : 0;

  return { currentStreak, longestStreak };
}

function parseWordCloudFilter(value: unknown): 'all' | 'useful' {
  return value === 'useful' ? 'useful' : 'all';
}

export function getWordCloud(params: { period?: unknown; limit?: unknown; filter?: unknown }, db: Database = getDb()): WordCloudTerm[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 50, 200);
  const filterMode = parseWordCloudFilter(params.filter);
  const rows = db.prepare(`
    SELECT text
    FROM messages
    WHERE ts >= @since AND text IS NOT NULL AND TRIM(text) <> ''
    ORDER BY ts DESC
    LIMIT 30000
  `).all({ since }) as TextRow[];
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const term of (row.text ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
      if (filterMode === 'useful') {
        if (/^\d+$/.test(term)) continue;
        if (USEFUL_WORD_STOP_SET.has(term)) continue;
      }
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text))
    .slice(0, limit);
}

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

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
    LIMIT 50000
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
  };
}

const SESSION_GAP_SECONDS = 4 * 3600;
const GHOST_WINDOW_SECONDS = 24 * 3600;

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

  const rows = db.prepare(`
    SELECT m.chat_jid, m.ts, m.from_me
    FROM messages m
    WHERE m.ts >= @since
    ORDER BY m.chat_jid, m.ts, m.rowid
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
    for (let i = 0; i < messages.length; i++) {
      if (!messages[i].from_me) continue;
      totalSent++;
      let replied = false;
      for (let j = i + 1; j < messages.length; j++) {
        if (!messages[j].from_me) {
          replied = messages[j].ts - messages[i].ts <= GHOST_WINDOW_SECONDS;
          break;
        }
      }
      if (!replied) ghosted++;
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
      const d = new Date(msg.ts * 1000);
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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

  return { initiationRatio, conversationDepth, ghostScore, relationshipTrajectory, lateNightTexters };
}

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
  params: { period?: unknown; limit?: unknown },
  db: Database = getDb(),
): LinkIntelligence {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 15, 50);

  const rows = db.prepare(`
    SELECT
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
    ORDER BY messages.ts ASC
  `).all({ since }) as LinkMessageRow[];

  // --- Domain leaderboard + categories ---
  const domainCounts = new Map<string, number>();
  const linksByDate = new Map<string, number>();
  const contactLinks = new Map<string, { name: string; sent: number; received: number }>();
  let totalLinks = 0;

  for (const row of rows) {
    const urls = extractUrls(row.text);
    if (urls.length === 0) continue;

    totalLinks += urls.length;
    const date = new Date(row.ts * 1000).toISOString().slice(0, 10);
    linksByDate.set(date, (linksByDate.get(date) ?? 0) + urls.length);

    const jid = row.jid ?? 'unknown';
    const displayName = row.name ?? row.contact_name ?? jid;
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
  const timelineBuckets = new Map<string, { images: number; videos: number; audio: number; links: number }>();
  for (const row of rows) {
    const date = new Date(row.ts * 1000).toISOString().slice(0, 10);
    if (!timelineBuckets.has(date)) {
      timelineBuckets.set(date, { images: 0, videos: 0, audio: 0, links: 0 });
    }
    const bucket = timelineBuckets.get(date)!;

    const mt = row.media_type?.toLowerCase() ?? '';
    if (mt === 'image') bucket.images++;
    else if (mt === 'video') bucket.videos++;
    else if (mt === 'audio') bucket.audio++;

    const urls = extractUrls(row.text);
    bucket.links += urls.length;
  }

  const mediaTimeline: MediaTimelinePoint[] = [...timelineBuckets.entries()]
    .filter(([, b]) => b.images + b.videos + b.audio + b.links > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, b]) => ({ date, ...b }));

  // --- Sharing asymmetry ---
  const contactMedia = new Map<string, { name: string; mediaSent: number; mediaReceived: number }>();
  for (const row of rows) {
    const mt = row.media_type?.toLowerCase() ?? '';
    if (!mt) continue;

    const jid = row.jid ?? 'unknown';
    const displayName = row.name ?? row.contact_name ?? jid;
    if (!contactMedia.has(jid)) {
      contactMedia.set(jid, { name: displayName, mediaSent: 0, mediaReceived: 0 });
    }
    const entry = contactMedia.get(jid)!;
    if (row.from_me) entry.mediaSent++;
    else entry.mediaReceived++;
  }

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
  };
}

export const statsRouter = Router();

statsRouter.get('/overview', (_req, res) => {
  res.json(getOverviewStats());
});

statsRouter.get('/top-contacts', (req, res) => {
  res.json(getTopContacts(req.query));
});

statsRouter.get('/message-volume', (req, res) => {
  res.json(getMessageVolume(req.query));
});

statsRouter.get('/activity-heatmap', (req, res) => {
  res.json(getActivityHeatmap(req.query));
});

statsRouter.get('/hour-of-day', (req, res) => {
  res.json(getHourOfDayStats(req.query));
});

statsRouter.get('/day-of-week', (req, res) => {
  res.json(getDayOfWeekStats(req.query));
});

statsRouter.get('/media-breakdown', (req, res) => {
  res.json(getMediaBreakdown(req.query));
});

statsRouter.get('/media-senders', (req, res) => {
  res.json(getMediaSenders(req.query));
});

statsRouter.get('/sent-received-ratio', (req, res) => {
  res.json(getSentReceivedRatio(req.query));
});

statsRouter.get('/response-times', (req, res) => {
  res.json(getResponseTimes(req.query));
});

statsRouter.get('/group-activity', (req, res) => {
  res.json(getGroupActivity(req.query));
});

statsRouter.get('/streaks', (req, res) => {
  res.json(getMessageStreaks(req.query));
});

statsRouter.get('/word-cloud', (req, res) => {
  res.json(getWordCloud(req.query));
});

statsRouter.get('/emoji-analytics', (req, res) => {
  res.json(getEmojiAnalytics(req.query));
});

statsRouter.get('/conversation-dynamics', (req, res) => {
  res.json(getConversationDynamics(req.query));
});

statsRouter.get('/link-intelligence', (req, res) => {
  res.json(getLinkIntelligence(req.query));
});

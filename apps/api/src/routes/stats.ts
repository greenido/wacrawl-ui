import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.js';
import { cleanDisplayNameSql, contactDisplayNameSql, contactMatchSql } from '../lib/displayName.js';
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
import type {
  ActivityHeatmapPoint,
  DayOfWeekStat,
  GroupActivityStat,
  HourOfDayStat,
  MediaBreakdownStat,
  MediaSenderStat,
  MessageStreaks,
  MessageVolumePoint,
  OverviewStats,
  ResponseTimeStat,
  SentReceivedRatioPoint,
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

interface HourOfDayRow {
  hour: string;
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
        CASE
          WHEN from_me = 1 THEN chat_jid
          ELSE COALESCE(sender_jid, chat_jid)
        END AS jid,
        ${contactDisplayNameSql('contacts')} AS contact_name,
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
      LEFT JOIN contacts ON ${contactMatchSql('contacts', `CASE
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

export function getHourOfDayStats(params: { period?: unknown }, db: Database = getDb()): HourOfDayStat[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const rows = db.prepare(`
    SELECT strftime('%H', ts, 'unixepoch') AS hour, COUNT(*) AS count
    FROM messages
    WHERE ts >= @since
    GROUP BY hour
    ORDER BY hour ASC
  `).all({ since }) as HourOfDayRow[];

  return rows.map((row) => ({ hour: Number(row.hour), count: row.count }));
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
      LEFT JOIN contacts ON ${contactMatchSql('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')}
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
    LEFT JOIN contacts AS chat_contacts ON ${contactMatchSql('chat_contacts', 'ordered.chat_jid')}
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

export function getWordCloud(params: { period?: unknown; limit?: unknown }, db: Database = getDb()): WordCloudTerm[] {
  const since = sinceTimestamp(parsePeriod(params.period));
  const limit = parseLimit(params.limit, 50, 200);
  const rows = db.prepare(`
    SELECT text
    FROM messages
    WHERE ts >= @since AND text IS NOT NULL AND TRIM(text) <> ''
  `).all({ since }) as TextRow[];
  const stopWords = new Set(['about', 'after', 'also', 'and', 'are', 'but', 'for', 'from', 'good', 'have', 'hello', 'hey', 'not', 'the', 'this', 'that', 'with', 'you', 'your']);
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const term of (row.text ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
      if (!stopWords.has(term)) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text))
    .slice(0, limit);
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

import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.js';
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
import type { ActivityHeatmapPoint, MessageVolumePoint, OverviewStats, TopContact } from '../types.js';

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
  const cleanName = (expression: string) => `
    CASE
      WHEN ${expression} IS NOT NULL
        AND TRIM(${expression}) <> ''
        AND TRIM(${expression}) NOT LIKE '%=%'
        AND TRIM(${expression}) NOT LIKE '%GIAB%'
        AND TRIM(${expression}) NOT LIKE '+%'
      THEN TRIM(${expression})
      ELSE NULL
    END
  `;

  const rows = db.prepare(`
    WITH normalized_messages AS (
      SELECT
        CASE
          WHEN from_me = 1 THEN chat_jid
          ELSE COALESCE(sender_jid, chat_jid)
        END AS jid,
        ${cleanName('contacts.full_name')} AS contact_name,
        ${cleanName(`
          CASE
            WHEN from_me = 1 THEN messages.chat_name
            ELSE messages.sender_name
          END
        `)} AS message_name,
        ${cleanName(`
          CASE
            WHEN messages.chat_jid = CASE
              WHEN messages.from_me = 1 THEN messages.chat_jid
              ELSE COALESCE(messages.sender_jid, messages.chat_jid)
            END THEN messages.chat_name
            ELSE NULL
          END
        `)} AS direct_chat_name,
        from_me
      FROM messages
      LEFT JOIN contacts ON contacts.jid = CASE
        WHEN messages.from_me = 1 THEN messages.chat_jid
        ELSE COALESCE(messages.sender_jid, messages.chat_jid)
      END
      WHERE ts >= @since
    )
    SELECT
      jid,
      COALESCE(
        MAX(message_name),
        MAX(direct_chat_name),
        MAX(contact_name),
        jid,
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

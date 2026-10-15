import type { Database } from 'better-sqlite3';
import { getDb } from '../../db.js';
import { chatKindSql, columnExists, parseChatKind } from '../../lib/chatKind.js';
import { canonicalJidSql, cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins } from '../../lib/displayName.js';
import {
  parseLimit,
  parsePeriod,
  parseYear,
  scanCoverage,
  sinceTimestamp,
  unixSecondsToIso,
  yearBounds,
} from '../../lib/query.js';
import { dateInTimezone, resolveStatsTimeZone, tsModifierSql } from '../../lib/timezone.js';
import { categorizeDomain, extractUrls, parseDomain } from '../../lib/urlExtract.js';
import type {
  ArchivedChats,
  DistinctiveTerm,
  DistinctiveWords,
  DormancyReport,
  FirstSharedStat,
  HourOfDayStat,
  LinkCategoryStat,
  LinkDomainStat,
  LinkIntelligence,
  MediaTimelinePoint,
  SharingAsymmetryStat,
  YearChatStat,
  YearInReview,
} from '../../types.js';
import {
  DAY_SECONDS,
  DAYS_PER_MONTH,
  EMOJI_REGEX,
  isNoiseToken,
  topCounted,
  WORD_TOKEN_RE,
} from './shared.js';

interface DormancyRow {
  jid: string;
  name: string | null;
  baselineCount: number;
  recentCount: number;
  lastTs: number;
}

/**
 * Contacts who used to be part of the daily traffic and are not any more.
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

interface ActivityHeatmapRow {
  date: string;
  count: number;
}

interface MediaBreakdownRow {
  mediaType: string;
  count: number;
  totalBytes: number;
}

interface TextRow {
  text: string | null;
}

interface CountRow {
  count: number;
}

/**
 * One calendar year assembled into a single page.
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

  const rows = db.prepare(`
    SELECT text, ts, from_me, media_type, jid, name, contact_name
    FROM (
      SELECT
        messages.rowid,
        messages.text,
        messages.ts,
        messages.from_me,
        messages.media_type,
        ${canonicalJidSql('contacts', 'CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END')} AS jid,
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

  for (const row of rows) {
    const urls = extractUrls(row.text);
    const mediaType = row.media_type?.toLowerCase() ?? '';
    const isTimelineMedia = mediaType === 'image' || mediaType === 'video' || mediaType === 'audio';
    if (urls.length === 0 && !mediaType) continue;

    const jid = row.jid ?? 'unknown';
    const isPerson = !jid.endsWith('@g.us') && !jid.endsWith('@status') && !jid.endsWith('@broadcast');
    const displayName = row.name ?? row.contact_name ?? jid;

    if (urls.length > 0) {
      totalLinks += urls.length;

      if (isPerson) {
        if (!contactLinks.has(jid)) {
          contactLinks.set(jid, { name: displayName, sent: 0, received: 0 });
        }
        const entry = contactLinks.get(jid)!;
        if (row.from_me) {
          entry.sent += urls.length;
        } else {
          entry.received += urls.length;
        }
      }

      for (const url of urls) {
        const domain = parseDomain(url);
        if (domain) {
          domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
        }
      }
    }

    if (mediaType && isPerson) {
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

  const domainLeaderboard: LinkDomainStat[] = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count, category: categorizeDomain(domain) }));

  const uniqueDomains = domainCounts.size;

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

  const mediaTimeline: MediaTimelinePoint[] = [...timelineBuckets.entries()]
    .filter(([, b]) => b.images + b.videos + b.audio + b.links > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, b]) => ({ date, ...b }));

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

/** Messages scanned for distinctive words; the newest ones, when the archive is larger. */
const DISTINCTIVE_WORDS_MAX_ROWS = 60_000;

/** A word must turn up this often on its own side before it can represent it. */
const DISTINCTIVE_MIN_SIDE_COUNT = 3;

/** |z| above this is the conventional 95% line; below it the lean is noise. */
const DISTINCTIVE_MIN_Z = 1.96;

/**
 * Words that are characteristically yours, and characteristically everyone else's.
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

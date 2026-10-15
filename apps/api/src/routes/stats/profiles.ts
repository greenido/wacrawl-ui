import type { Database } from 'better-sqlite3';
import { getDb } from '../../db.js';
import { tableExists } from '../../lib/chatKind.js';
import { canonicalJidSql, cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins } from '../../lib/displayName.js';
import { percentile } from '../../lib/percentile.js';
import { parseLimit, scanCoverage, unixSecondsToIso } from '../../lib/query.js';
import { resolveSelfJids } from '../../lib/selfIdentity.js';
import {
  dateInTimezone,
  firstQueryString,
  hourInTimezone,
  monthInTimezone,
  resolveStatsTimeZone,
  tsModifierSql,
} from '../../lib/timezone.js';
import type {
  ContactProfile,
  ContactProfileSilence,
  GroupDirectoryEntry,
  GroupFoundingYear,
  GroupGraveyardEntry,
  GroupLifecycle,
  GroupProfile,
} from '../../types.js';
import {
  ChatNotFoundError,
  DAY_SECONDS,
  EMOJI_REGEX,
  isNoiseToken,
  NotAGroupError,
  SESSION_GAP_SECONDS,
  summarizeGaps,
  topCounted,
  WORD_TOKEN_RE,
} from './shared.js';

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

interface MediaBreakdownRow {
  mediaType: string;
  count: number;
  totalBytes: number;
}

/**
 * Everything one relationship looks like, in a single response.
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
  jid: string;
  rawJid: string;
  name: string | null;
  isAdmin: number;
  isActive: number;
}

interface GroupSpeakerRow {
  jid: string | null;
  contactName: string | null;
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
  rawJids: string[];
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
}

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
      name: speaker.contactName ?? member?.name ?? speaker.pushName ?? speaker.jid ?? 'Unknown',
      isAdmin: member?.isAdmin ?? false,
      isActive: member?.isActive ?? false,
      messageCount: speaker.messageCount,
      share: share(speaker.messageCount),
      firstMessageAt: unixSecondsToIso(speaker.firstTs),
      lastMessageAt: unixSecondsToIso(speaker.lastTs),
    };
  });

  const quiet = activeOthers.filter((member) => !spokeJids.has(member.jid));
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

interface GroupLifecycleRow {
  jid: string;
  name: string | null;
  messageCount: number;
  lastTs: number | null;
  createdAt: number | null;
}

/**
 * How groups age, and how many of them have quietly died.
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
    graveyard: dead
      .filter((row) => row.messageCount > 0)
      .sort((a, b) => b.messageCount - a.messageCount || (b.lastTs ?? 0) - (a.lastTs ?? 0))
      .slice(0, limit)
      .map(toEntry),
  };
}

import type { Database } from 'better-sqlite3';
import { parsePeriod, sinceTimestamp } from './query.js';
import { firstQueryString, resolveStatsTimeZone, tsModifierSql } from './timezone.js';

/** Bad filter input, reported as a 400 rather than silently widening the results. */
export class SearchFilterError extends Error {
  readonly code = 'VALIDATION_ERROR';
}

export interface SearchFilterParams {
  chat?: unknown;
  sender?: unknown;
  contact?: unknown;
  mediaType?: unknown;
  period?: unknown;
  from?: unknown;
  to?: unknown;
  hour?: unknown;
  weekday?: unknown;
  timeZone?: unknown;
}

export interface SearchFilters {
  /** Bare conditions over `messages`, to be ANDed into any statement that reads it. */
  conditions: string[];
  bindings: Record<string, string | number>;
}

/** Longer than any JID or media type; only here so a junk URL fails clearly. */
const MAX_VALUE_LENGTH = 256;
const SECONDS_PER_DAY = 86_400;

function parseText(value: unknown, name: string): string | undefined {
  const text = firstQueryString(value);
  if (text && text.length > MAX_VALUE_LENGTH) {
    throw new SearchFilterError(`${name} is too long.`);
  }
  return text;
}

/** A real calendar date as YYYY-MM-DD, returned as UTC-midnight epoch seconds alongside. */
function parseDay(value: unknown, name: string): { day: string; epoch: number } | undefined {
  const day = firstQueryString(value);
  if (!day) return undefined;
  const epochMs = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T00:00:00Z`) : NaN;
  // Date.parse rejects 2023-13-01 but rolls 2023-02-30 over to March, hence the round trip.
  if (Number.isNaN(epochMs) || new Date(epochMs).toISOString().slice(0, 10) !== day) {
    throw new SearchFilterError(`${name} must be a date in YYYY-MM-DD form.`);
  }
  return { day, epoch: epochMs / 1000 };
}

function parseIntegerInRange(value: unknown, name: string, max: number): number | undefined {
  const raw = firstQueryString(value);
  if (!raw) return undefined;
  const parsed = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(parsed) || parsed > max) {
    throw new SearchFilterError(`${name} must be a whole number from 0 to ${max}.`);
  }
  return parsed;
}

/**
 * Every spelling of one person in `messages`: the archive files them under a
 * phone JID and an opaque `@lid`, and the reports merge the two, so a drill-down
 * from a report has to as well or its count will not match.
 */
function identityJids(db: Database, jid: string): string {
  const rows = db
    .prepare('SELECT jid, lid FROM contacts WHERE jid = @jid OR lid = @jid')
    .all({ jid }) as Array<{ jid: string; lid: string | null }>;
  const jids = new Set([jid]);
  for (const row of rows) {
    jids.add(row.jid);
    if (row.lid) jids.add(row.lid);
  }
  return JSON.stringify([...jids]);
}

/**
 * Translate search filters into SQL, using the same expressions as the stats
 * routes so a chart's bucket and the messages listed behind it stay in step:
 *
 *  - `sender` is who wrote the message (`me` for your own).
 *  - `contact` is the Top Contacts definition, both directions: what they sent
 *    anywhere plus what you sent in your direct chat with them.
 *  - `period` is the dashboard's rolling window, not a calendar range.
 *  - `from`, `to`, `hour` and `weekday` read the viewer's calendar via `timeZone`.
 */
export function parseSearchFilters(params: SearchFilterParams, db: Database): SearchFilters {
  const conditions: string[] = [];
  const bindings: SearchFilters['bindings'] = {};
  const localTs = tsModifierSql(resolveStatsTimeZone(params.timeZone), 'messages.ts');

  const chat = parseText(params.chat, 'chat');
  if (chat) {
    conditions.push('messages.chat_jid = @chat');
    bindings.chat = chat;
  }

  const sender = parseText(params.sender, 'sender');
  if (sender === 'me') {
    conditions.push('messages.from_me = 1');
  } else if (sender) {
    conditions.push(`
      messages.from_me = 0
      AND COALESCE(messages.sender_jid, messages.chat_jid) IN (SELECT value FROM json_each(@senderJids))
    `);
    bindings.senderJids = identityJids(db, sender);
  }

  const contact = parseText(params.contact, 'contact');
  if (contact) {
    conditions.push(`
      CASE WHEN messages.from_me = 1 THEN messages.chat_jid ELSE COALESCE(messages.sender_jid, messages.chat_jid) END
        IN (SELECT value FROM json_each(@contactJids))
    `);
    bindings.contactJids = identityJids(db, contact);
  }

  const mediaType = parseText(params.mediaType, 'mediaType');
  if (mediaType === 'any') {
    conditions.push("messages.media_type IS NOT NULL AND messages.media_type <> ''");
  } else if (mediaType) {
    conditions.push('messages.media_type = @mediaType');
    bindings.mediaType = mediaType;
  }

  const rawPeriod = firstQueryString(params.period);
  if (rawPeriod) {
    const period = parsePeriod(rawPeriod);
    if (period !== rawPeriod) {
      throw new SearchFilterError('period must be day, week, month, year or all.');
    }
    if (period !== 'all') {
      conditions.push('messages.ts >= @since');
      bindings.since = sinceTimestamp(period);
    }
  }

  const from = parseDay(params.from, 'from');
  const to = parseDay(params.to, 'to');
  if (from && to && from.day > to.day) {
    throw new SearchFilterError('from must not be after to.');
  }
  // The raw `ts` bound is what lets these use the index; no zone is a full day
  // from UTC plus a margin, and the `date()` test settles the exact edge.
  if (from) {
    conditions.push(`messages.ts >= @fromEpoch AND date(${localTs}) >= @from`);
    bindings.from = from.day;
    bindings.fromEpoch = from.epoch - SECONDS_PER_DAY;
  }
  if (to) {
    conditions.push(`messages.ts < @toEpoch AND date(${localTs}) <= @to`);
    bindings.to = to.day;
    bindings.toEpoch = to.epoch + 2 * SECONDS_PER_DAY;
  }

  const hour = parseIntegerInRange(params.hour, 'hour', 23);
  if (hour !== undefined) {
    conditions.push(`CAST(strftime('%H', ${localTs}) AS INTEGER) = @hour`);
    bindings.hour = hour;
  }

  const weekday = parseIntegerInRange(params.weekday, 'weekday', 6);
  if (weekday !== undefined) {
    conditions.push(`CAST(strftime('%w', ${localTs}) AS INTEGER) = @weekday`);
    bindings.weekday = weekday;
  }

  return { conditions, bindings };
}

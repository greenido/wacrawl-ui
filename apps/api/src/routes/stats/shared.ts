import type { Database } from 'better-sqlite3';
import { cleanDisplayNameSql, contactDisplayNameSql, contactLeftJoins } from '../../lib/displayName.js';
import { percentile } from '../../lib/percentile.js';
import { USEFUL_WORD_STOP_SET } from '../../lib/wordCloudUsefulStopWords.js';

export const DAY_SECONDS = 86_400;
export const DAYS_PER_MONTH = 30;
export const SESSION_GAP_SECONDS = 4 * 3600;
export const GHOST_WINDOW_SECONDS = 24 * 3600;

/**
 * Runs of three or more letters or digits, in any script.
 */
export const WORD_TOKEN_RE = /[\p{L}\p{N}]{3,}/gu;
const ALL_DIGITS_RE = /^\p{N}+$/u;

/**
 * Long letter-and-digit runs are media keys and URL slugs, not words.
 */
const OPAQUE_TOKEN_RE = /^(?=.{12,})(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N}]+$/u;

export const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

/** True for tokens that carry no meaning in a word cloud. */
export function isNoiseToken(term: string): boolean {
  return ALL_DIGITS_RE.test(term) || OPAQUE_TOKEN_RE.test(term) || USEFUL_WORD_STOP_SET.has(term);
}

export function summarizeGaps(gaps: number[]): { median: number; p90: number } {
  const sorted = [...gaps].sort((a, b) => a - b);
  return { median: Math.round(percentile(sorted, 50)), p90: Math.round(percentile(sorted, 90)) };
}

export function topCounted<T>(counts: Map<string, number>, limit: number, build: (key: string, count: number) => T): T[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => build(key, count));
}

interface NameRow {
  jid: string;
  name: string | null;
}

export function resolveChatNames(jids: string[], db: Database): Map<string, string> {
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

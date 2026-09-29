import type { Database } from 'better-sqlite3';

/**
 * Real archives label one-to-one chats `dm`; the fixtures here — and older
 * wacrawl versions — say `direct`. Filtering on a single literal silently
 * matched nothing on real data, which is how the Chats page ended up listing
 * groups only, and why the dormancy report came back empty for every account.
 *
 * `status` is WhatsApp's own broadcast pseudo-chat. It is neither a person nor
 * a group, so it belongs in neither bucket.
 */
export const DIRECT_CHAT_KINDS = ['dm', 'direct'] as const;

export type ChatKindFilter = 'direct' | 'group' | 'all';

export function parseChatKind(value: unknown, fallback: ChatKindFilter = 'all'): ChatKindFilter {
  if (value === 'direct' || value === 'group' || value === 'all') return value;
  return fallback;
}

/**
 * SQL predicate for a chat-kind filter, as a bare condition with no leading
 * `AND`/`WHERE` so callers can place it wherever it fits.
 *
 * The literals are compile-time constants rather than bound parameters because
 * this composes into larger statements that are prepared once and reused.
 */
export function chatKindSql(kind: ChatKindFilter, column = 'chats.kind'): string {
  if (kind === 'group') return `${column} = 'group'`;
  if (kind === 'direct') return `${column} IN ('dm', 'direct')`;
  return `${column} IN ('dm', 'direct', 'group')`;
}

/** Older archives predate a table; a missing one should degrade, not throw. */
export function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = @name")
    .get({ name }) as { present: number } | undefined;
  return row !== undefined;
}

/** Newer wacrawl archives add columns (e.g. `chats.archived`); older ones lack them. */
export function columnExists(db: Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>;
  return columns.some((row) => row.name === column);
}

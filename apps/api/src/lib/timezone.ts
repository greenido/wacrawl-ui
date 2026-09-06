/**
 * First string value from Express queryparams (handles string | string[]).
 */
export function firstQueryString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return undefined;
}

/**
 * IANA timezone for stats bucketing when the client does not send one.
 * UTC matches the legacy SQL strftime('%H', ts, 'unixepoch') behavior.
 */
export function resolveStatsTimeZone(raw: unknown): string {
  const candidate = firstQueryString(raw);
  if (!candidate) return 'UTC';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'UTC';
  }
}

const formattersCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formattersCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    });
    formattersCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Calendar hour 0–23 for Unix epoch seconds in the given IANA time zone. */
export function hourInTimezone(epochSeconds: number, timeZone: string): number {
  if (timeZone === 'UTC') {
    return new Date(epochSeconds * 1000).getUTCHours();
  }
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(new Date(epochSeconds * 1000));
  const value = Number(parts.find((p) => p.type === 'hour')?.value);
  if (!Number.isFinite(value)) return 0;
  return Math.min(23, Math.max(0, value));
}

const dateFormattersCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormattersCache.get(timeZone);
  if (!formatter) {
    // en-CA renders as YYYY-MM-DD, which is the shape every bucket key uses.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormattersCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Calendar date as YYYY-MM-DD for Unix epoch seconds in the given IANA time zone. */
export function dateInTimezone(epochSeconds: number, timeZone: string): string {
  if (timeZone === 'UTC') {
    return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
  }
  return getDateFormatter(timeZone).format(new Date(epochSeconds * 1000));
}

/** Calendar month as YYYY-MM for Unix epoch seconds in the given IANA time zone. */
export function monthInTimezone(epochSeconds: number, timeZone: string): string {
  return dateInTimezone(epochSeconds, timeZone).slice(0, 7);
}

/** Zone's UTC offset in minutes at a given instant (positive east of Greenwich). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  if (timeZone === 'UTC') return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
  if (!Number.isFinite(asUtc)) return 0;

  // Sub-second drift between the two readings is irrelevant at minute resolution.
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** IANA zone the API process itself is running in. */
export const SERVER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * SQLite modifiers that move a `ts` column into `timeZone`'s calendar.
 *
 * SQLite ships no IANA database, so only two conversions are exact: UTC, and
 * the server's own zone via `'localtime'` — which *is* DST-correct because
 * SQLite defers to the C library. This dashboard is served from the same
 * machine as the browser, so the requested zone is the server zone in practice
 * and that branch is the one that runs.
 *
 * Any other zone falls back to the zone's offset *right now*, applied uniformly.
 * That misfiles messages sent within `offset` hours of midnight on historical
 * dates whose DST state differs from today's — a far smaller error than the
 * blanket UTC bucketing this replaces.
 */
export function timeZoneModifiers(timeZone: string): string[] {
  if (timeZone === 'UTC') return [];
  if (timeZone === SERVER_TIME_ZONE) return ["'localtime'"];
  const offset = timeZoneOffsetMinutes(timeZone);
  if (offset === 0) return [];
  // Numeric, so it can never carry anything injectable into the SQL text.
  return [`'${offset > 0 ? '+' : '-'}${Math.abs(offset)} minutes'`];
}

/** `date(...)`/`strftime(...)` argument list for a timestamp column in `timeZone`. */
export function tsModifierSql(timeZone: string, column = 'ts'): string {
  return [column, "'unixepoch'", ...timeZoneModifiers(timeZone)].join(', ');
}

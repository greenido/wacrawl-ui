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

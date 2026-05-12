import { getUnixTime } from 'date-fns';
import type { Granularity, Period } from '../types.js';

const PERIOD_SECONDS: Record<Exclude<Period, 'all'>, number> = {
  day: 86_400,
  week: 604_800,
  month: 2_592_000,
  year: 31_536_000,
};

export function parsePeriod(value: unknown): Period {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year' || value === 'all') {
    return value;
  }
  return 'all';
}

export function parseGranularity(value: unknown, fallback: Granularity): Granularity {
  if (value === 'day' || value === 'week' || value === 'month') {
    return value;
  }
  return fallback;
}

export function parseLimit(value: unknown, fallback = 10, max = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

export function parseYear(value: unknown): number {
  const parsed = Number(value);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(parsed) || parsed < 1970 || parsed > currentYear + 1) {
    return currentYear;
  }
  return parsed;
}

export function sinceTimestamp(period: Period, now = Date.now()): number {
  if (period === 'all') {
    return 0;
  }

  return Math.floor(now / 1000) - PERIOD_SECONDS[period];
}

export function unixSecondsToIso(seconds: number | null | undefined): string | null {
  if (seconds == null) {
    return null;
  }
  return new Date(seconds * 1000).toISOString();
}

export function bucketDateSql(granularity: Granularity): string {
  if (granularity === 'month') {
    return "strftime('%Y-%m-01', ts, 'unixepoch')";
  }

  if (granularity === 'week') {
    return "date(ts, 'unixepoch', 'weekday 1', '-7 days')";
  }

  return "date(ts, 'unixepoch')";
}

export function yearBounds(year: number): { start: number; end: number } {
  const start = getUnixTime(new Date(Date.UTC(year, 0, 1)));
  const end = getUnixTime(new Date(Date.UTC(year + 1, 0, 1)));
  return { start, end };
}

export function normalizeBucketDate(date: string, granularity: Granularity): string {
  void granularity;
  return date;
}

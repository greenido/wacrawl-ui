import { getUnixTime } from 'date-fns';
import type { Granularity, Period, ScanCoverage } from '../types.js';
import { timeZoneOffsetMinutes, tsModifierSql } from './timezone.js';

/**
 * Describe a capped scan so the UI can say the numbers are partial.
 *
 * `scanned === limit` cannot distinguish "hit the cap" from "happens to have
 * exactly that many rows"; erring towards claiming truncation is the safe
 * direction, since the alternative is silently overstating coverage.
 */
export function scanCoverage(scanned: number, limit: number): ScanCoverage {
  return { scanned, limit, truncated: scanned >= limit };
}

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

export function parseOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
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

export function bucketDateSql(granularity: Granularity, timeZone = 'UTC'): string {
  const ts = tsModifierSql(timeZone);

  if (granularity === 'month') {
    return `strftime('%Y-%m-01', ${ts})`;
  }

  if (granularity === 'week') {
    return `date(${ts}, 'weekday 1', '-7 days')`;
  }

  return `date(${ts})`;
}

/**
 * Unix bounds of a calendar year *as the viewer experiences it*.
 *
 * The offset is read at each boundary rather than once, so a year that starts
 * and ends on opposite sides of a DST transition still lines up with the
 * timezone-aware bucketing in `bucketDateSql`.
 */
export function yearBounds(year: number, timeZone = 'UTC'): { start: number; end: number } {
  const utcStart = new Date(Date.UTC(year, 0, 1));
  const utcEnd = new Date(Date.UTC(year + 1, 0, 1));
  const start = getUnixTime(utcStart) - timeZoneOffsetMinutes(timeZone, utcStart) * 60;
  const end = getUnixTime(utcEnd) - timeZoneOffsetMinutes(timeZone, utcEnd) * 60;
  return { start, end };
}

export function normalizeBucketDate(date: string, granularity: Granularity): string {
  void granularity;
  return date;
}

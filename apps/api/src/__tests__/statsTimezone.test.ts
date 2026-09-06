import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { timeZoneOffsetMinutes } from '../lib/timezone.js';
import {
  getActivityHeatmap,
  getDayOfWeekStats,
  getMessageStreaks,
  getMessageVolume,
} from '../routes/stats.js';
import { createTestDb } from './testDb.js';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

/**
 * Every fixture message sits at 22:13:20 UTC, i.e. after midnight anywhere east
 * of UTC+2. That makes this archive the worst case for the UTC-only bucketing
 * these reports used to do: all six messages were filed a day early.
 */
const EAST_OF_UTC = 'Asia/Jerusalem';

describe('timezone-aware bucketing', () => {
  it('reports the viewer calendar day, not the UTC one', () => {
    db = createTestDb();

    const utc = getMessageVolume({ period: 'all', granularity: 'day' }, db);
    const local = getMessageVolume({ period: 'all', granularity: 'day', timeZone: EAST_OF_UTC }, db);

    expect(utc.map((p) => p.date)).toEqual([
      '2023-11-14', '2023-11-15', '2023-11-16', '2023-11-17', '2023-11-18', '2023-11-19',
    ]);
    expect(local.map((p) => p.date)).toEqual([
      '2023-11-15', '2023-11-16', '2023-11-17', '2023-11-18', '2023-11-19', '2023-11-20',
    ]);
  });

  it('shifts day-of-week counts along with the date', () => {
    db = createTestDb();

    // Tue–Sun in UTC becomes Wed–Mon once the messages land on their real day.
    expect(getDayOfWeekStats({ period: 'all' }, db).map((d) => d.label))
      .toEqual(['Sun', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(getDayOfWeekStats({ period: 'all', timeZone: EAST_OF_UTC }, db).map((d) => d.label))
      .toEqual(['Sun', 'Mon', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('keeps heatmap cells and year bounds in the same calendar', () => {
    db = createTestDb();

    expect(getActivityHeatmap({ year: 2023 }, db).map((p) => p.date))
      .toEqual(['2023-11-14', '2023-11-15', '2023-11-16', '2023-11-17', '2023-11-18', '2023-11-19']);
    expect(getActivityHeatmap({ year: 2023, timeZone: EAST_OF_UTC }, db).map((p) => p.date))
      .toEqual(['2023-11-15', '2023-11-16', '2023-11-17', '2023-11-18', '2023-11-19', '2023-11-20']);
  });

  it('still sees one unbroken run when every day shifts together', () => {
    db = createTestDb();

    expect(getMessageStreaks({ period: 'all' }, db).longestStreak).toBe(6);
    expect(getMessageStreaks({ period: 'all', timeZone: EAST_OF_UTC }, db).longestStreak).toBe(6);
  });

  it('falls back to UTC for an unusable timezone rather than throwing', () => {
    db = createTestDb();

    expect(getDayOfWeekStats({ period: 'all', timeZone: 'Mars/Olympus_Mons' }, db))
      .toEqual(getDayOfWeekStats({ period: 'all' }, db));
  });
});

describe('timeZoneOffsetMinutes', () => {
  it('reads a fixed-offset zone', () => {
    expect(timeZoneOffsetMinutes('UTC')).toBe(0);
    // No DST in either, so these hold whenever the suite runs.
    expect(timeZoneOffsetMinutes('Asia/Kolkata')).toBe(330);
    expect(timeZoneOffsetMinutes('Asia/Tokyo')).toBe(540);
  });

  it('tracks DST at the instant it is asked about', () => {
    const winter = new Date('2024-01-15T12:00:00Z');
    const summer = new Date('2024-07-15T12:00:00Z');

    expect(timeZoneOffsetMinutes('Europe/Berlin', winter)).toBe(60);
    expect(timeZoneOffsetMinutes('Europe/Berlin', summer)).toBe(120);
    expect(timeZoneOffsetMinutes('America/New_York', winter)).toBe(-300);
    expect(timeZoneOffsetMinutes('America/New_York', summer)).toBe(-240);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStatsCache,
  etagFor,
  getCached,
  statsCacheKey,
  statsCacheSize,
  STATS_CACHE_TTL_MS,
} from '../lib/statsCache.js';

beforeEach(() => {
  clearStatsCache();
});

describe('stats cache', () => {
  it('computes once per key and replays the memoized value', () => {
    const compute = vi.fn(() => ({ total: 42 }));
    const key = statsCacheKey('overview', {});

    const first = getCached(key, compute);
    const second = getCached(key, compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('separates entries by route and by params', () => {
    const now = Date.now();

    expect(statsCacheKey('overview', {}, now)).not.toBe(statsCacheKey('streaks', {}, now));
    expect(statsCacheKey('streaks', { period: 'day' }, now))
      .not.toBe(statsCacheKey('streaks', { period: 'week' }, now));
  });

  it('ignores param order and undefined params', () => {
    const now = Date.now();

    expect(statsCacheKey('top-contacts', { period: 'day', limit: 10 }, now))
      .toBe(statsCacheKey('top-contacts', { limit: 10, period: 'day' }, now));
    expect(statsCacheKey('top-contacts', { period: 'day', limit: undefined }, now))
      .toBe(statsCacheKey('top-contacts', { period: 'day' }, now));
  });

  it('distinguishes structured params that stringify alike', () => {
    const now = Date.now();

    expect(statsCacheKey('search', { q: { a: '1' } }, now))
      .not.toBe(statsCacheKey('search', { q: { b: '2' } }, now));
  });

  it('drops every entry when the time bucket rolls over', () => {
    const now = Date.now();
    getCached(statsCacheKey('overview', {}, now), () => 1);
    getCached(statsCacheKey('streaks', {}, now), () => 2);
    expect(statsCacheSize()).toBe(2);

    statsCacheKey('overview', {}, now + STATS_CACHE_TTL_MS);

    expect(statsCacheSize()).toBe(0);
  });

  it('recomputes after expiry instead of serving a stale window', () => {
    const now = Date.now();
    const compute = vi.fn(() => ({ total: 1 }));

    getCached(statsCacheKey('streaks', { period: 'day' }, now), compute);
    getCached(statsCacheKey('streaks', { period: 'day' }, now + STATS_CACHE_TTL_MS), compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('does not cache thrown errors', () => {
    const key = statsCacheKey('overview', {});
    const compute = vi.fn(() => {
      throw new Error('SQLITE_CANTOPEN');
    });

    expect(() => getCached(key, compute)).toThrow('SQLITE_CANTOPEN');
    expect(() => getCached(key, compute)).toThrow('SQLITE_CANTOPEN');
    expect(compute).toHaveBeenCalledTimes(2);
    expect(statsCacheSize()).toBe(0);
  });

  it('derives a stable strong etag from the key', () => {
    const key = statsCacheKey('overview', {});

    expect(etagFor(key)).toBe(etagFor(key));
    expect(etagFor(key)).toMatch(/^"[\w-]+"$/);
    expect(etagFor(key)).not.toBe(etagFor(`${key}x`));
  });
});

import { endOfMonth, format, parseISO } from 'date-fns';
import type { Period, SearchFilters } from '../api/client';

const FILTER_KEYS = ['chat', 'sender', 'contact', 'mediaType', 'period', 'from', 'to', 'hour', 'weekday'] as const;

export type SearchFilterKey = (typeof FILTER_KEYS)[number];

export function readSearchFilters(params: URLSearchParams): SearchFilters {
  const filters: SearchFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) (filters as Record<SearchFilterKey, string>)[key] = value;
  }
  return filters;
}

/** Link to the Search page narrowed to `filters`. "All time" is the default, so it stays out of the URL. */
export function searchPath(filters: Omit<SearchFilters, 'hour' | 'weekday'> & { hour?: number; weekday?: number }): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && !(key === 'period' && value === 'all')) {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `/search?${query}` : '/search';
}

/** The from/to a chart bucket covers, for a bucket labelled by its first day. */
export function bucketRange(firstDay: string, granularity: 'day' | 'month'): { from: string; to: string } {
  return {
    from: firstDay,
    to: granularity === 'month' ? format(endOfMonth(parseISO(firstDay)), 'yyyy-MM-dd') : firstDay,
  };
}

export const PERIOD_LABELS: Record<Exclude<Period, 'all'>, string> = {
  day: 'Last 24 hours',
  week: 'Last 7 days',
  month: 'Last 30 days',
  year: 'Last 365 days',
};

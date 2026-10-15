import type {
  ActivityHeatmapPoint,
  ArchivedChats,
  ChatSummary,
  ContactProfile,
  ConversationDynamics,
  DayOfWeekStat,
  DistinctiveWords,
  DormancyReport,
  EmojiAnalytics,
  GroupActivityStat,
  GroupDirectoryEntry,
  GroupLifecycle,
  GroupProfile,
  GroupSort,
  HealthResponse,
  HourOfDayStat,
  LinkIntelligence,
  ListResponse,
  MediaBreakdownStat,
  MediaItem,
  MediaSenderStat,
  MessageStreaks,
  MessageSummary,
  MessageVolumePoint,
  OverviewStats,
  PathsSettingsResponse,
  Period,
  PersonSummary,
  ReplyLatencyDistribution,
  ResolvedArchivePaths,
  ResponseTimeStat,
  SearchResult,
  SentReceivedRatioPoint,
  SyncJobStatus,
  SyncStatusResponse,
  TopContact,
  WeeklyRhythm,
  WordCloud,
  YearInReview,
} from '../../../api/src/types';

export type * from '../../../api/src/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';

export class ApiClientError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Keep the generic HTTP message if the response is not JSON.
    }
    throw new ApiClientError(message, response.status);
  }

  return response.json() as Promise<T>;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, API_URL);
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Keep the generic HTTP message if the response is not JSON.
    }
    throw new ApiClientError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export function absoluteApiUrl(path: string): string {
  return new URL(path, API_URL).toString();
}

/**
 * Every report that buckets by calendar day, week or month has to be told which
 * calendar. Left unset the API falls back to UTC, which files anything sent
 * after ~21:00 local under the following day.
 */
export const VIEWER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  pathsSettings: () => request<PathsSettingsResponse>('/api/settings/paths'),
  pathsSettingsSave: (body: Partial<Record<keyof ResolvedArchivePaths, string>>) =>
    jsonRequest<{ ok: boolean; effective: ResolvedArchivePaths }>('/api/settings/paths', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  pathsSettingsReset: () =>
    jsonRequest<{ ok: boolean; effective: ResolvedArchivePaths }>('/api/settings/paths', { method: 'DELETE' }),
  syncStatus: () => request<SyncStatusResponse>('/api/sync/status'),
  // The header is what the API uses to tell a dashboard request apart from a
  // cross-origin POST; without it the request is refused.
  startSync: () =>
    jsonRequest<{ job: SyncJobStatus }>('/api/sync', {
      method: 'POST',
      headers: { 'X-Wacrawl-Request': '1' },
    }),
  overview: () => request<OverviewStats>('/api/stats/overview'),
  topContacts: (period: Period, limit = 10) => request<TopContact[]>('/api/stats/top-contacts', { period, limit }),
  messageVolume: (period: Period, granularity: 'day' | 'week' | 'month' = period === 'year' || period === 'all' ? 'month' : 'day') =>
    request<MessageVolumePoint[]>('/api/stats/message-volume', { period, granularity, timeZone: VIEWER_TIME_ZONE }),
  activityHeatmap: (year = new Date().getFullYear()) =>
    request<ActivityHeatmapPoint[]>('/api/stats/activity-heatmap', { year, timeZone: VIEWER_TIME_ZONE }),
  hourOfDay: (period: Period, timeZone = VIEWER_TIME_ZONE) =>
    request<HourOfDayStat[]>('/api/stats/hour-of-day', { period, timeZone }),
  dayOfWeek: (period: Period) =>
    request<DayOfWeekStat[]>('/api/stats/day-of-week', { period, timeZone: VIEWER_TIME_ZONE }),
  mediaBreakdown: (period: Period) => request<MediaBreakdownStat[]>('/api/stats/media-breakdown', { period }),
  mediaSenders: (period: Period, limit = 10) => request<MediaSenderStat[]>('/api/stats/media-senders', { period, limit }),
  sentReceivedRatio: (period: Period) =>
    request<SentReceivedRatioPoint[]>('/api/stats/sent-received-ratio', { period, timeZone: VIEWER_TIME_ZONE }),
  responseTimes: (period: Period, limit = 10, minResponses = 5) =>
    request<ResponseTimeStat[]>('/api/stats/response-times', { period, limit, minResponses }),
  replyLatency: (period: Period) => request<ReplyLatencyDistribution>('/api/stats/reply-latency', { period }),
  contactProfile: (jid: string, limit = 15) =>
    request<ContactProfile>('/api/stats/contact-profile', { jid, limit, timeZone: VIEWER_TIME_ZONE }),
  groupProfile: (jid: string, limit = 15) =>
    request<GroupProfile>('/api/stats/group-profile', { jid, limit, timeZone: VIEWER_TIME_ZONE }),
  groups: (sort: GroupSort = 'recent', limit = 200) =>
    request<GroupDirectoryEntry[]>('/api/stats/groups', { sort, limit }),
  dormancy: (limit = 12, kind: 'direct' | 'group' | 'all' = 'direct') =>
    request<DormancyReport>('/api/stats/dormancy', { limit, kind }),
  weeklyRhythm: (period: Period) =>
    request<WeeklyRhythm>('/api/stats/weekly-rhythm', { period, timeZone: VIEWER_TIME_ZONE }),
  distinctiveWords: (period: Period, limit = 12) =>
    request<DistinctiveWords>('/api/stats/distinctive-words', { period, limit }),
  groupLifecycle: (limit = 8) =>
    request<GroupLifecycle>('/api/stats/group-lifecycle', { limit, timeZone: VIEWER_TIME_ZONE }),
  archivedChats: (limit = 8) => request<ArchivedChats>('/api/stats/archived-chats', { limit }),
  yearInReview: (year: number, limit = 10) =>
    request<YearInReview>('/api/stats/year-in-review', { year, limit, timeZone: VIEWER_TIME_ZONE }),
  groupActivity: (period: Period, limit = 10) => request<GroupActivityStat[]>('/api/stats/group-activity', { period, limit }),
  streaks: (period: Period) => request<MessageStreaks>('/api/stats/streaks', { period, timeZone: VIEWER_TIME_ZONE }),
  wordCloud: (period: Period, limit = 40, filter: 'all' | 'useful' = 'all') =>
    request<WordCloud>('/api/stats/word-cloud', { period, limit, filter }),
  emojiAnalytics: (period: Period, limit = 15) =>
    request<EmojiAnalytics>('/api/stats/emoji-analytics', { period, limit }),
  conversationDynamics: (period: Period, limit = 10, timeZone = VIEWER_TIME_ZONE) =>
    request<ConversationDynamics>('/api/stats/conversation-dynamics', { period, limit, timeZone }),
  linkIntelligence: (period: Period, limit = 15) =>
    request<LinkIntelligence>('/api/stats/link-intelligence', { period, limit, timeZone: VIEWER_TIME_ZONE }),
  people: (limit = 50, offset = 0) => request<ListResponse<PersonSummary>>('/api/people', { limit, offset }),
  chats: (limit = 50, offset = 0, kind?: 'direct' | 'group', jid?: string) =>
    request<ListResponse<ChatSummary>>('/api/chats', { limit, offset, kind, jid }),
  chatMessages: (jid: string, limit = 50, offset = 0) =>
    request<ListResponse<MessageSummary>>(`/api/chats/${encodeURIComponent(jid)}/messages`, { limit, offset }),
  messageOffset: (id: number) => request<{ chatJid: string; offset: number }>(`/api/messages/${id}/offset`),
  media: (limit = 60, offset = 0, type?: string) => request<ListResponse<MediaItem>>('/api/media', { limit, offset, type }),
  search: (q: string, limit = 50, offset = 0) => request<ListResponse<SearchResult>>('/api/search', { q, limit, offset }),
};

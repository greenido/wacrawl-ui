import type { Period } from '../store/appStore';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';

export interface OverviewStats {
  totalMessages: number;
  totalChats: number;
  totalContacts: number;
  totalMediaFiles: number;
  oldestMessage: string | null;
  newestMessage: string | null;
}

export interface TopContact {
  jid: string;
  name: string;
  messageCount: number;
  sentByMe: number;
  sentByThem: number;
}

export interface MessageVolumePoint {
  date: string;
  sent: number;
  received: number;
}

export interface ActivityHeatmapPoint {
  date: string;
  count: number;
}

export interface ListResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface PersonSummary {
  jid: string;
  name: string;
  messageCount: number;
  mediaCount: number;
  sentByMe: number;
  sentByThem: number;
  lastMessageAt: string | null;
}

export interface ChatSummary {
  jid: string;
  kind: string;
  name: string;
  messageCount: number;
  mediaCount: number;
  participantCount: number;
  lastMessageAt: string | null;
  lastMessageText: string | null;
}

export interface MessageSummary {
  id: number;
  msgId: string;
  chatJid: string;
  chatName: string;
  senderJid: string | null;
  senderName: string | null;
  sentAt: string;
  fromMe: boolean;
  text: string | null;
  messageType: string | null;
  mediaType: string | null;
  mediaPath: string | null;
}

export interface MediaItem {
  id: number;
  chatJid: string;
  chatName: string;
  senderJid: string | null;
  senderName: string | null;
  sentAt: string;
  fromMe: boolean;
  text: string | null;
  mediaType: string;
  mediaPath: string;
  mediaSize: number | null;
  fileUrl: string;
}

export interface SearchResult extends MessageSummary {
  snippet: string;
}

export interface HourOfDayStat {
  hour: number;
  count: number;
}

export interface DayOfWeekStat {
  day: number;
  label: string;
  count: number;
}

export interface MediaBreakdownStat {
  mediaType: string;
  count: number;
  totalBytes: number;
}

export interface MediaSenderStat {
  jid: string;
  name: string;
  mediaCount: number;
  totalBytes: number;
}

export interface SentReceivedRatioPoint {
  month: string;
  sent: number;
  received: number;
  ratio: number | null;
}

export interface ResponseTimeStat {
  jid: string;
  name: string;
  responseCount: number;
  averageSeconds: number;
}

export interface GroupActivityStat {
  jid: string;
  name: string;
  messageCount: number;
  participantCount: number;
}

export interface MessageStreaks {
  currentStreak: number;
  longestStreak: number;
}

export interface WordCloudTerm {
  text: string;
  value: number;
}

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

export function absoluteApiUrl(path: string): string {
  return new URL(path, API_URL).toString();
}

export const api = {
  health: () => request<{ ok: boolean; dbPath: string }>('/api/health'),
  overview: () => request<OverviewStats>('/api/stats/overview'),
  topContacts: (period: Period, limit = 10) => request<TopContact[]>('/api/stats/top-contacts', { period, limit }),
  messageVolume: (period: Period, granularity: 'day' | 'week' | 'month' = period === 'year' || period === 'all' ? 'month' : 'day') =>
    request<MessageVolumePoint[]>('/api/stats/message-volume', { period, granularity }),
  activityHeatmap: (year = new Date().getFullYear()) =>
    request<ActivityHeatmapPoint[]>('/api/stats/activity-heatmap', { year }),
  hourOfDay: (period: Period) => request<HourOfDayStat[]>('/api/stats/hour-of-day', { period }),
  dayOfWeek: (period: Period) => request<DayOfWeekStat[]>('/api/stats/day-of-week', { period }),
  mediaBreakdown: (period: Period) => request<MediaBreakdownStat[]>('/api/stats/media-breakdown', { period }),
  mediaSenders: (period: Period, limit = 10) => request<MediaSenderStat[]>('/api/stats/media-senders', { period, limit }),
  sentReceivedRatio: (period: Period) => request<SentReceivedRatioPoint[]>('/api/stats/sent-received-ratio', { period }),
  responseTimes: (period: Period, limit = 10) => request<ResponseTimeStat[]>('/api/stats/response-times', { period, limit }),
  groupActivity: (period: Period, limit = 10) => request<GroupActivityStat[]>('/api/stats/group-activity', { period, limit }),
  streaks: (period: Period) => request<MessageStreaks>('/api/stats/streaks', { period }),
  wordCloud: (period: Period, limit = 40) => request<WordCloudTerm[]>('/api/stats/word-cloud', { period, limit }),
  people: (limit = 50, offset = 0) => request<ListResponse<PersonSummary>>('/api/people', { limit, offset }),
  chats: (limit = 50, offset = 0, kind?: 'direct' | 'group') => request<ListResponse<ChatSummary>>('/api/chats', { limit, offset, kind }),
  chatMessages: (jid: string, limit = 50, offset = 0) =>
    request<ListResponse<MessageSummary>>(`/api/chats/${encodeURIComponent(jid)}/messages`, { limit, offset }),
  media: (limit = 60, offset = 0, type?: string) => request<ListResponse<MediaItem>>('/api/media', { limit, offset, type }),
  search: (q: string, limit = 50, offset = 0) => request<ListResponse<SearchResult>>('/api/search', { q, limit, offset }),
};

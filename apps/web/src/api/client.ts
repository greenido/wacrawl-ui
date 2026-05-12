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

export const api = {
  health: () => request<{ ok: boolean; dbPath: string }>('/api/health'),
  overview: () => request<OverviewStats>('/api/stats/overview'),
  topContacts: (period: Period, limit = 10) => request<TopContact[]>('/api/stats/top-contacts', { period, limit }),
  messageVolume: (period: Period, granularity: 'day' | 'week' | 'month' = period === 'year' || period === 'all' ? 'month' : 'day') =>
    request<MessageVolumePoint[]>('/api/stats/message-volume', { period, granularity }),
  activityHeatmap: (year = new Date().getFullYear()) =>
    request<ActivityHeatmapPoint[]>('/api/stats/activity-heatmap', { year }),
};

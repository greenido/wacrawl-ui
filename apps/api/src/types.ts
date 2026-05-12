export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
export type Granularity = 'day' | 'week' | 'month';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

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

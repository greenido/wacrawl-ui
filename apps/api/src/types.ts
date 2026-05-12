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

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
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

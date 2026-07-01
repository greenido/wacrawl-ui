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
  phone: string | null;
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
  /** Media type of the latest message, when known — used for sidebar previews when text is an opaque key. */
  lastMessageMediaType: string | null;
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

export interface EmojiStat {
  emoji: string;
  count: number;
}

export interface EmojiContactStat {
  name: string;
  jid: string;
  count: number;
  topEmoji: string;
}

export interface EmojiAnalytics {
  topEmojis: EmojiStat[];
  topSentEmojis: EmojiStat[];
  topReceivedEmojis: EmojiStat[];
  totalEmojiCount: number;
  uniqueEmojiCount: number;
  topEmojiUsers: EmojiContactStat[];
}

export interface InitiationRatioStat {
  jid: string;
  name: string;
  initiatedByMe: number;
  initiatedByThem: number;
  ratio: number;
}

export interface ConversationDepthStat {
  jid: string;
  name: string;
  avgMessagesPerSession: number;
  totalSessions: number;
}

export interface GhostScoreStat {
  jid: string;
  name: string;
  ghostedCount: number;
  totalSent: number;
  ghostRate: number;
}

export interface RelationshipTrajectoryPoint {
  month: string;
  count: number;
}

export interface RelationshipTrajectoryStat {
  jid: string;
  name: string;
  trend: RelationshipTrajectoryPoint[];
  direction: 'growing' | 'fading' | 'stable';
}

export interface LateNightTexterStat {
  jid: string;
  name: string;
  lateNight: number;
  workHours: number;
  otherHours: number;
  totalMessages: number;
  lateNightPct: number;
}

export interface ConversationDynamics {
  initiationRatio: InitiationRatioStat[];
  conversationDepth: ConversationDepthStat[];
  ghostScore: GhostScoreStat[];
  relationshipTrajectory: RelationshipTrajectoryStat[];
  lateNightTexters: LateNightTexterStat[];
}

export type LinkCategory = 'video' | 'social' | 'news' | 'shopping' | 'music' | 'dev' | 'reference' | 'other';

export interface LinkDomainStat {
  domain: string;
  count: number;
  category: LinkCategory;
}

export interface MediaTimelinePoint {
  date: string;
  images: number;
  videos: number;
  audio: number;
  links: number;
}

export interface SharingAsymmetryStat {
  jid: string;
  name: string;
  mediaSent: number;
  mediaReceived: number;
  linksSent: number;
  linksReceived: number;
}

export interface LinkCategoryStat {
  category: LinkCategory;
  count: number;
  topDomain: string;
}

export interface FirstSharedStat {
  jid: string;
  name: string;
  firstMessageText: string | null;
  firstMessageDate: string;
  firstMediaType: string | null;
  firstMediaDate: string | null;
}

export interface LinkIntelligence {
  domainLeaderboard: LinkDomainStat[];
  mediaTimeline: MediaTimelinePoint[];
  sharingAsymmetry: SharingAsymmetryStat[];
  linkCategories: LinkCategoryStat[];
  firstShared: FirstSharedStat[];
  totalLinks: number;
  uniqueDomains: number;
}

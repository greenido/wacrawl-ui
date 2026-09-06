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

/**
 * How much of the archive a report actually read.
 *
 * Several reports cap the rows they pull into memory. Without this the UI
 * presents a partial scan as if it covered the whole selected period.
 */
export interface ScanCoverage {
  /** Rows the report read. */
  scanned: number;
  /** Cap the scan was subject to. */
  limit: number;
  /** True when the cap was hit, so the figures cover only the most recent rows. */
  truncated: boolean;
}

export interface ResponseTimeStat {
  jid: string;
  name: string;
  responseCount: number;
  averageSeconds: number;
  medianSeconds: number;
  p90Seconds: number;
  myResponseCount: number;
  myMedianSeconds: number | null;
  theirResponseCount: number;
  theirMedianSeconds: number | null;
}

export interface ReplyLatencyBucket {
  /** Inclusive lower bound in seconds. */
  fromSeconds: number;
  /** Exclusive upper bound in seconds, or null for the open-ended tail. */
  toSeconds: number | null;
  label: string;
  mine: number;
  theirs: number;
}

export interface ReplyLatencySide {
  count: number;
  medianSeconds: number;
  p90Seconds: number;
}

export interface ReplyLatencyDistribution {
  buckets: ReplyLatencyBucket[];
  mine: ReplyLatencySide;
  theirs: ReplyLatencySide;
  scan: ScanCoverage;
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

export interface WordCloud {
  terms: WordCloudTerm[];
  scan: ScanCoverage;
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
  scan: ScanCoverage;
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
  scan: ScanCoverage;
}

export interface YearChatStat {
  jid: string;
  name: string;
  kind: string;
  messageCount: number;
}

export interface YearNewContact {
  jid: string;
  name: string;
  firstMessageAt: string;
  messageCount: number;
}

export interface YearInReview {
  year: number;
  /** Null when the archive holds nothing for this year. */
  totals: {
    messages: number;
    sent: number;
    received: number;
    media: number;
    chats: number;
    activeDays: number;
  };
  busiestDay: { date: string; count: number } | null;
  busiestMonth: { month: string; count: number } | null;
  longestStreakDays: number;
  monthlyVolume: Array<{ month: string; sent: number; received: number }>;
  hourOfDay: HourOfDayStat[];
  topChats: YearChatStat[];
  newContacts: YearNewContact[];
  topWords: WordCloudTerm[];
  topEmojis: EmojiStat[];
  mediaBreakdown: MediaBreakdownStat[];
  /** Null when the archive has nothing for the year before. */
  previousYear: { messages: number; changeRatio: number | null } | null;
  scan: ScanCoverage;
}

export interface ContactProfileTotals {
  messages: number;
  sentByMe: number;
  sentByThem: number;
  media: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number | null;
  activeDays: number;
}

export interface ContactProfileSilence {
  days: number;
  /** Last message before the gap. */
  startedAt: string | null;
  /** First message after it. */
  endedAt: string | null;
}

export interface ContactProfile {
  jid: string;
  name: string;
  kind: string;
  phone: string | null;
  totals: ContactProfileTotals;
  monthlyVolume: Array<{ month: string; sent: number; received: number }>;
  hourOfDay: HourOfDayStat[];
  latency: { mine: ReplyLatencySide; theirs: ReplyLatencySide };
  /** Who opens a conversation after a lull, and who sends the closing message. */
  initiation: { byMe: number; byThem: number };
  lastWord: { mine: number; theirs: number };
  longestSilence: ContactProfileSilence | null;
  mediaBreakdown: MediaBreakdownStat[];
  topWords: WordCloudTerm[];
  topEmojis: EmojiStat[];
  scan: ScanCoverage;
}

export interface GroupParticipantStat {
  jid: string;
  name: string;
  isAdmin: boolean;
  /** False once someone has left or been removed. */
  isActive: boolean;
  messageCount: number;
  /** Fraction of the scanned messages this participant sent, 0..1. */
  share: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export interface GroupRosterSummary {
  /** Distinct people, current members and past ones together. */
  total: number;
  active: number;
  /** Active members other than me. speakers + lurkers add up to this. */
  others: number;
  departed: number;
  /** Admins among `others` — current members other than me. */
  admins: number;
  /** Current members who have sent at least one message in the scan. */
  speakers: number;
  /** Current members who have sent none. */
  lurkers: number;
}

export interface GroupProfile {
  jid: string;
  name: string;
  ownerJid: string | null;
  ownerName: string | null;
  createdAt: string | null;
  /**
   * False when the archive predates wacrawl's group tables. The message-derived
   * half of the report still works; the roster half is empty.
   */
  hasRoster: boolean;
  totals: {
    messages: number;
    sentByMe: number;
    media: number;
    firstMessageAt: string | null;
    lastMessageAt: string | null;
    daysSinceLastMessage: number | null;
    activeDays: number;
  };
  roster: GroupRosterSummary;
  /** Talk share, loudest first. */
  topParticipants: GroupParticipantStat[];
  /** Current members with nothing to say, admins first so moderators stand out. */
  quietMembers: Array<{ jid: string; name: string; isAdmin: boolean }>;
  /**
   * How lopsided the conversation is: the share held by the loudest member and
   * by the loudest five. A 900-person group where five people send 80% of the
   * traffic is a broadcast channel wearing a group's clothes.
   */
  concentration: { topOneShare: number; topFiveShare: number };
  monthlyVolume: Array<{ month: string; sent: number; received: number }>;
  hourOfDay: HourOfDayStat[];
  mediaBreakdown: MediaBreakdownStat[];
  topWords: WordCloudTerm[];
  topEmojis: EmojiStat[];
  scan: ScanCoverage;
}

export interface GroupDirectoryEntry {
  jid: string;
  name: string;
  /** Null when the archive has no roster for this group. */
  memberCount: number | null;
  messageCount: number;
  /** Messages I sent, so "groups I only lurk in" is answerable from the list. */
  sentByMe: number;
  lastMessageAt: string | null;
  createdAt: string | null;
}

export interface DormantContactStat {
  jid: string;
  name: string;
  /** Messages in the baseline window (before the recent window begins). */
  baselineCount: number;
  baselinePerMonth: number;
  /** Messages in the recent window. */
  recentCount: number;
  recentPerMonth: number;
  /** 0 = unchanged, 1 = gone completely. Negative when the chat grew. */
  dropRatio: number;
  lastMessageAt: string | null;
  daysSinceLastMessage: number;
}

export interface DormancyReport {
  baselineDays: number;
  recentDays: number;
  minBaselineMessages: number;
  contacts: DormantContactStat[];
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
  scan: ScanCoverage;
}

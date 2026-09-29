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

/** How much of the archive a capped report actually read. */
export interface ScanCoverage {
  scanned: number;
  limit: number;
  truncated: boolean;
}

export interface ReplyLatencyBucket {
  fromSeconds: number;
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

export interface WordCloud {
  terms: WordCloudTerm[];
  scan: ScanCoverage;
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
  startedAt: string | null;
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
  isActive: boolean;
  messageCount: number;
  share: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export interface GroupRosterSummary {
  total: number;
  active: number;
  others: number;
  departed: number;
  admins: number;
  speakers: number;
  lurkers: number;
}

export interface GroupProfile {
  jid: string;
  name: string;
  ownerJid: string | null;
  ownerName: string | null;
  createdAt: string | null;
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
  topParticipants: GroupParticipantStat[];
  quietMembers: Array<{ jid: string; name: string; isAdmin: boolean }>;
  concentration: { topOneShare: number; topFiveShare: number };
  monthlyVolume: Array<{ month: string; sent: number; received: number }>;
  hourOfDay: HourOfDayStat[];
  mediaBreakdown: MediaBreakdownStat[];
  topWords: WordCloudTerm[];
  topEmojis: EmojiStat[];
  scan: ScanCoverage;
}

export type GroupSort = 'recent' | 'members' | 'messages';

export interface GroupDirectoryEntry {
  jid: string;
  name: string;
  memberCount: number | null;
  messageCount: number;
  sentByMe: number;
  lastMessageAt: string | null;
  createdAt: string | null;
}

export interface DormantContactStat {
  jid: string;
  name: string;
  baselineCount: number;
  baselinePerMonth: number;
  recentCount: number;
  recentPerMonth: number;
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
  previousYear: { messages: number; changeRatio: number | null } | null;
  scan: ScanCoverage;
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

export class ApiClientError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ResolvedArchivePaths {
  whatsappContainer: string | null;
  chatDb: string | null;
  contactsDb: string | null;
  mediaRoot: string;
  primaryDb: string;
}

export interface HealthResponse {
  ok: boolean;
  dbPath: string;
  paths: ResolvedArchivePaths;
  mediaAccessible: boolean;
  mediaError: string | null;
}

export interface PathsSettingsResponse {
  envDefaults: ResolvedArchivePaths;
  storedOverride: Partial<Record<keyof ResolvedArchivePaths, string | null>> | null;
  effective: ResolvedArchivePaths;
  pathsFile: boolean;
}

export type SyncState = 'idle' | 'running' | 'succeeded' | 'failed';

export interface SyncJobStatus {
  state: SyncState;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  hint: string | null;
}

export interface SyncStatusResponse {
  /** False when the server was started with WACRAWL_DISABLE_SYNC=1. */
  enabled: boolean;
  job: SyncJobStatus;
  archive: {
    lastImportAt: string | null;
    sourcePath: string | null;
  };
}

export interface WeeklyRhythmCell {
  /** 0 = Sunday, matching `DayOfWeekStat.day`. */
  day: number;
  hour: number;
  count: number;
}

export interface WeeklyRhythm {
  cells: WeeklyRhythmCell[];
  peak: WeeklyRhythmCell | null;
  total: number;
}

export interface DistinctiveTerm {
  text: string;
  mine: number;
  theirs: number;
  score: number;
}

export interface DistinctiveWords {
  mine: DistinctiveTerm[];
  theirs: DistinctiveTerm[];
  scan: ScanCoverage;
}

export interface GroupGraveyardEntry {
  jid: string;
  name: string;
  messageCount: number;
  createdAt: string | null;
  lastMessageAt: string | null;
  daysSilent: number | null;
}

export interface GroupFoundingYear {
  year: number;
  alive: number;
  dead: number;
}

export interface GroupLifecycle {
  dormantDays: number;
  totalGroups: number;
  deadGroups: number;
  neverActiveGroups: number;
  medianAgeDays: number | null;
  oldestAlive: GroupGraveyardEntry | null;
  foundedByYear: GroupFoundingYear[];
  graveyard: GroupGraveyardEntry[];
}

export interface BuriedChat {
  jid: string;
  name: string;
  kind: 'direct' | 'group';
  recentMessages: number;
  recentFromMe: number;
  lastMessageAt: string | null;
}

export interface ArchivedChats {
  available: boolean;
  windowDays: number;
  totalChats: number;
  archivedChats: number;
  archivedDirect: number;
  archivedGroups: number;
  stillActiveCount: number;
  stillActive: BuriedChat[];
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

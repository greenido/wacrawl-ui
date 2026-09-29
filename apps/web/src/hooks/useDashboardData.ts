import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type ActivityHeatmapPoint,
  type ArchivedChats,
  type ConversationDynamics,
  type DayOfWeekStat,
  type DistinctiveWords,
  type DormancyReport,
  type EmojiAnalytics,
  type GroupActivityStat,
  type GroupLifecycle,
  type HourOfDayStat,
  type MediaBreakdownStat,
  type MediaSenderStat,
  type MessageStreaks,
  type MessageVolumePoint,
  type OverviewStats,
  type ReplyLatencyDistribution,
  type ResponseTimeStat,
  type SentReceivedRatioPoint,
  type TopContact,
  type WeeklyRhythm,
  type WordCloud,
} from '../api/client';
import { useAppStore } from '../store/appStore';

export interface DashboardData {
  overview: OverviewStats | null;
  topContacts: TopContact[];
  messageVolume: MessageVolumePoint[];
  heatmap: ActivityHeatmapPoint[];
  hourOfDay: HourOfDayStat[];
  dayOfWeek: DayOfWeekStat[];
  mediaBreakdown: MediaBreakdownStat[];
  mediaSenders: MediaSenderStat[];
  sentReceivedRatio: SentReceivedRatioPoint[];
  responseTimes: ResponseTimeStat[];
  replyLatency: ReplyLatencyDistribution | null;
  groupActivity: GroupActivityStat[];
  streaks: MessageStreaks | null;
  wordCloud: WordCloud | null;
  emojiAnalytics: EmojiAnalytics | null;
  conversationDynamics: ConversationDynamics | null;
  dormancy: DormancyReport | null;
  weeklyRhythm: WeeklyRhythm | null;
  distinctiveWords: DistinctiveWords | null;
  groupLifecycle: GroupLifecycle | null;
  archivedChats: ArchivedChats | null;
  heatmapYear: number;
  loadingOverview: boolean;
  loadingCharts: boolean;
  error: string | null;
}

const EMPTY: Omit<DashboardData, 'heatmapYear' | 'loadingOverview' | 'loadingCharts' | 'error'> = {
  overview: null,
  topContacts: [],
  messageVolume: [],
  heatmap: [],
  hourOfDay: [],
  dayOfWeek: [],
  mediaBreakdown: [],
  mediaSenders: [],
  sentReceivedRatio: [],
  responseTimes: [],
  replyLatency: null,
  groupActivity: [],
  streaks: null,
  wordCloud: null,
  emojiAnalytics: null,
  conversationDynamics: null,
  dormancy: null,
  weeklyRhythm: null,
  distinctiveWords: null,
  groupLifecycle: null,
  archivedChats: null,
};

/**
 * Owns the dashboard's fan-out so the report components stay presentational.
 *
 * Overview is period-independent; everything else refetches when the period
 * changes. Both reload when `dataVersion` moves, which is how a refresh reaches
 * the dashboard. The API caches these per archive fingerprint, so a period
 * toggle and back — or a refresh that found nothing new — is served from memory.
 */
export function useDashboardData(): DashboardData {
  const period = useAppStore((state) => state.period);
  const dataVersion = useAppStore((state) => state.dataVersion);
  const heatmapYear = useMemo(() => new Date().getFullYear(), []);
  const [data, setData] = useState(EMPTY);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingOverview(true);
    api.overview()
      .then((overview) => {
        if (active) setData((current) => ({ ...current, overview }));
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingOverview(false);
      });

    return () => {
      active = false;
    };
  }, [dataVersion]);

  useEffect(() => {
    let active = true;
    setLoadingCharts(true);
    setError(null);

    Promise.all([
      api.topContacts(period, 10),
      api.messageVolume(period),
      api.activityHeatmap(heatmapYear),
      api.hourOfDay(period),
      api.dayOfWeek(period),
      api.mediaBreakdown(period),
      api.mediaSenders(period, 6),
      api.sentReceivedRatio(period),
      api.responseTimes(period, 6),
      api.replyLatency(period),
      api.groupActivity(period, 6),
      api.streaks(period),
      api.wordCloud(period, 30, 'useful'),
      api.emojiAnalytics(period, 15),
      api.conversationDynamics(period, 8),
      api.dormancy(6),
      api.weeklyRhythm(period),
      api.distinctiveWords(period, 12),
      api.groupLifecycle(6),
      api.archivedChats(6),
    ])
      .then(([
        topContacts, messageVolume, heatmap, hourOfDay, dayOfWeek, mediaBreakdown, mediaSenders,
        sentReceivedRatio, responseTimes, replyLatency, groupActivity, streaks, wordCloud,
        emojiAnalytics, conversationDynamics, dormancy, weeklyRhythm, distinctiveWords, groupLifecycle,
        archivedChats,
      ]) => {
        if (!active) return;
        setData((current) => ({
          ...current,
          topContacts,
          messageVolume,
          heatmap,
          hourOfDay,
          dayOfWeek,
          mediaBreakdown,
          mediaSenders,
          sentReceivedRatio,
          responseTimes,
          replyLatency,
          groupActivity,
          streaks,
          wordCloud,
          emojiAnalytics,
          conversationDynamics,
          dormancy,
          weeklyRhythm,
          distinctiveWords,
          groupLifecycle,
          archivedChats,
        }));
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoadingCharts(false);
      });

    return () => {
      active = false;
    };
  }, [dataVersion, heatmapYear, period]);

  return { ...data, heatmapYear, loadingOverview, loadingCharts, error };
}

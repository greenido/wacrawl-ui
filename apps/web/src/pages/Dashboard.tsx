import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { ActivityHeatmap } from '../components/charts/ActivityHeatmap';
import { MessageVolumeArea } from '../components/charts/MessageVolumeArea';
import { TopContactsBar } from '../components/charts/TopContactsBar';
import { Card, CardTitle, ClickableCard, Skeleton } from '../components/ui/Card';
import {
  api,
  type ActivityHeatmapPoint,
  type ConversationDynamics,
  type DayOfWeekStat,
  type EmojiAnalytics,
  type GroupActivityStat,
  type HourOfDayStat,
  type MediaBreakdownStat,
  type MediaSenderStat,
  type MessageStreaks,
  type MessageVolumePoint,
  type OverviewStats,
  type ResponseTimeStat,
  type SentReceivedRatioPoint,
  type TopContact,
  type WordCloudTerm,
} from '../api/client';
import { formatBytes, formatNumber, cn } from '../lib/utils';
import { useAppStore } from '../store/appStore';

function formatDateRange(stats: OverviewStats | null): string {
  if (!stats?.oldestMessage || !stats.newestMessage) {
    return 'No archive dates yet';
  }

  return `${format(new Date(stats.oldestMessage), 'MMM yyyy')} -> ${format(new Date(stats.newestMessage), 'MMM yyyy')}`;
}

function StatCard({ label, value, loading, onDeepDive }: { label: string; value: string; loading: boolean; onDeepDive?: () => void }) {
  const content = (
    <>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 max-w-full" />
      ) : (
        <p
          className="mt-2 break-words font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-50"
          style={{ fontSize: 'clamp(0.75rem, calc(0.45rem + 4.5cqw), 1.5rem)' }}
        >
          {value}
        </p>
      )}
    </>
  );

  if (onDeepDive) {
    return (
      <ClickableCard className="@container min-w-0 p-4 dark:border-slate-800 dark:bg-slate-900" onActivate={onDeepDive} aria-label={`Open ${label} deep dive`}>
        {content}
      </ClickableCard>
    );
  }

  return (
    <Card className="@container min-w-0 p-4 dark:border-slate-800 dark:bg-slate-900">
      {content}
    </Card>
  );
}

function CompactBarCard({ title, data, dataKey, nameKey, loading, onDeepDive }: { title: string; data: Array<Record<string, string | number>>; dataKey: string; nameKey: string; loading: boolean; onDeepDive?: () => void }) {
  const content = (
    <>
      <CardTitle className="dark:text-slate-50">{title}</CardTitle>
      {loading ? <Skeleton className="mt-4 h-64" /> : (
        <div className="mt-4 h-64 overflow-x-auto">
          <BarChart width={520} height={256} data={data} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip />
            <Bar dataKey={dataKey} fill="#22c55e" radius={[8, 8, 0, 0]} />
          </BarChart>
        </div>
      )}
    </>
  );

  if (onDeepDive) {
    return (
      <ClickableCard className="dark:border-slate-800 dark:bg-slate-900" onActivate={onDeepDive} aria-label={`Open ${title} deep dive`}>
        {content}
      </ClickableCard>
    );
  }

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      {content}
    </Card>
  );
}

function ListCard({ title, children, onDeepDive }: { title: string; children: ReactNode; onDeepDive?: () => void }) {
  const content = (
    <>
      <CardTitle className="dark:text-slate-50">{title}</CardTitle>
      <div className="mt-4 space-y-3">{children}</div>
    </>
  );

  if (onDeepDive) {
    return (
      <ClickableCard className="dark:border-slate-800 dark:bg-slate-900" onActivate={onDeepDive} aria-label={`Open ${title} deep dive`}>
        {content}
      </ClickableCard>
    );
  }

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      {content}
    </Card>
  );
}

const loadingQuotes = [
  { text: "The single biggest problem in communication is the illusion that it has taken place.", author: "George Bernard Shaw" },
  { text: "The art of conversation is the art of hearing as well as of being heard.", author: "William Hazlitt" },
  { text: "Data is a precious thing and will last longer than the systems themselves.", author: "Tim Berners-Lee" },
  { text: "Deep-diving into your conversational archives...", author: "WaCrawl" },
  { text: "Counting your emojis, exclamation marks, and late-night messages...", author: "WaCrawl" },
  { text: "Reconstructing the history of your digital connections...", author: "WaCrawl" },
  { text: "Sorting through memories, media files, and long-forgotten threads...", author: "WaCrawl" },
  { text: "The most important thing in communication is hearing what isn't said.", author: "Peter Drucker" }
];

function QuotesLoader({ isLoading }: { isLoading: boolean }) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');
  const [shouldRender, setShouldRender] = useState(isLoading);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setFadeState('out');
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % loadingQuotes.length);
        setFadeState('in');
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setShouldRender(false), 550);
      return () => clearTimeout(timer);
    } else {
      setShouldRender(true);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  const currentQuote = loadingQuotes[quoteIndex];

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md transition-opacity duration-500",
        isLoading ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <div className="max-w-md px-6 text-center space-y-6">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/30 animate-pulse">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-8 w-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span>
          </span>
        </div>

        <div
          className={cn(
            "transition-all duration-300 transform min-h-[80px] flex flex-col justify-center",
            fadeState === 'in' ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
          )}
        >
          <p className="text-lg font-medium text-slate-100 leading-relaxed italic">
            "{currentQuote.text}"
          </p>
          <p className="mt-2 text-xs text-brand-400 font-semibold tracking-wider uppercase">
            — {currentQuote.author}
          </p>
        </div>

        <div className="w-48 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden relative">
          <div className="h-full bg-brand-500 rounded-full animate-progress absolute left-0 top-0 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const period = useAppStore((state) => state.period);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [topContacts, setTopContacts] = useState<TopContact[]>([]);
  const [messageVolume, setMessageVolume] = useState<MessageVolumePoint[]>([]);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapPoint[]>([]);
  const [hourOfDay, setHourOfDay] = useState<HourOfDayStat[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeekStat[]>([]);
  const [mediaBreakdown, setMediaBreakdown] = useState<MediaBreakdownStat[]>([]);
  const [mediaSenders, setMediaSenders] = useState<MediaSenderStat[]>([]);
  const [sentReceivedRatio, setSentReceivedRatio] = useState<SentReceivedRatioPoint[]>([]);
  const [responseTimes, setResponseTimes] = useState<ResponseTimeStat[]>([]);
  const [groupActivity, setGroupActivity] = useState<GroupActivityStat[]>([]);
  const [streaks, setStreaks] = useState<MessageStreaks | null>(null);
  const [emojiAnalytics, setEmojiAnalytics] = useState<EmojiAnalytics | null>(null);
  const [conversationDynamics, setConversationDynamics] = useState<ConversationDynamics | null>(null);
  const [emojiTab, setEmojiTab] = useState<'all' | 'sent' | 'received'>('all');
  const [wordCloudAll, setWordCloudAll] = useState<WordCloudTerm[]>([]);
  const [wordCloudUseful, setWordCloudUseful] = useState<WordCloudTerm[]>([]);
  const [wordCloudTab, setWordCloudTab] = useState<'all' | 'useful'>('useful');
  const [loadingWordCloudAll, setLoadingWordCloudAll] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const heatmapYear = useMemo(() => new Date().getFullYear(), []);

  function openWordSearch(term: string) {
    navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  useEffect(() => {
    let active = true;
    setLoadingOverview(true);
    api.overview()
      .then((stats) => {
        if (active) setOverview(stats);
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
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingCharts(true);
    setError(null);
    setWordCloudAll([]);

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
      api.groupActivity(period, 6),
      api.streaks(period),
      api.wordCloud(period, 30, 'useful'),
      api.emojiAnalytics(period, 15),
      api.conversationDynamics(period, 8),
    ])
      .then(([contacts, volume, activity, hours, weekdays, mediaTypes, senders, ratio, responses, groups, streakData, wordsUseful, emojis, dynamics]) => {
        if (!active) return;
        setTopContacts(contacts);
        setMessageVolume(volume);
        setHeatmap(activity);
        setHourOfDay(hours);
        setDayOfWeek(weekdays);
        setMediaBreakdown(mediaTypes);
        setMediaSenders(senders);
        setSentReceivedRatio(ratio);
        setResponseTimes(responses);
        setGroupActivity(groups);
        setStreaks(streakData);
        setWordCloudUseful(wordsUseful);
        setEmojiAnalytics(emojis);
        setConversationDynamics(dynamics);
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
  }, [heatmapYear, period]);

  useEffect(() => {
    if (wordCloudTab === 'all' && wordCloudAll.length === 0 && !loadingWordCloudAll) {
      setLoadingWordCloudAll(true);
      api.wordCloud(period, 30, 'all')
        .then((words) => {
          setWordCloudAll(words);
        })
        .catch((err: Error) => {
          console.error('Failed to load all word cloud words:', err);
        })
        .finally(() => {
          setLoadingWordCloudAll(false);
        });
    }
  }, [wordCloudTab, period, wordCloudAll.length, loadingWordCloudAll]);

  if (error && !overview && topContacts.length === 0 && messageVolume.length === 0) {
    return (
      <main className="p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900">
          <h2 className="text-xl font-semibold">Cannot connect to the WaCrawl API</h2>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <QuotesLoader isLoading={loadingOverview || loadingCharts} />
      <main className="space-y-6 p-8">
      <section className="grid grid-cols-5 gap-4">
        <StatCard label="Messages" value={formatNumber(overview?.totalMessages ?? 0)} loading={loadingOverview} onDeepDive={() => navigate('/search')} />
        <StatCard label="Chats" value={formatNumber(overview?.totalChats ?? 0)} loading={loadingOverview} onDeepDive={() => navigate('/chats')} />
        <StatCard label="Contacts" value={formatNumber(overview?.totalContacts ?? 0)} loading={loadingOverview} onDeepDive={() => navigate('/people')} />
        <StatCard label="Media Files" value={formatNumber(overview?.totalMediaFiles ?? 0)} loading={loadingOverview} onDeepDive={() => navigate('/media')} />
        <StatCard label="Archive Range" value={formatDateRange(overview)} loading={loadingOverview} onDeepDive={() => navigate('/search')} />
      </section>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      ) : null}

      <section className="grid grid-cols-2 gap-6">
        <MessageVolumeArea data={messageVolume} loading={loadingCharts} onDeepDive={() => navigate('/chats')} />
        <TopContactsBar data={topContacts} loading={loadingCharts} onContactClick={(jid) => navigate(`/chats?contact=${encodeURIComponent(jid)}`)} onDeepDive={() => navigate('/people')} />
        <ActivityHeatmap data={heatmap} loading={loadingCharts} year={heatmapYear} onDeepDive={() => navigate('/chats')} />
        <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="dark:text-slate-50">Emoji Analytics</CardTitle>
          {loadingCharts || !emojiAnalytics ? <Skeleton className="mt-4 h-64" /> : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-6 text-sm">
                <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Total emojis</span>
                  <span className="ml-2 font-bold text-slate-900 dark:text-slate-50">{formatNumber(emojiAnalytics.totalEmojiCount)}</span>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Unique</span>
                  <span className="ml-2 font-bold text-slate-900 dark:text-slate-50">{formatNumber(emojiAnalytics.uniqueEmojiCount)}</span>
                </div>
              </div>

              <div
                role="presentation"
                className="space-y-3"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  const tablist = event.currentTarget.querySelector('[role="tablist"]');
                  const targetNode = event.target as Node | null;
                  if (tablist && targetNode && tablist.contains(targetNode)) {
                    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                  }
                }}
              >
                <div role="tablist" aria-label="Emoji view mode" className="flex flex-wrap gap-2">
                  {(['all', 'sent', 'received'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={emojiTab === tab}
                      onClick={() => setEmojiTab(tab)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-sm font-semibold outline-none ring-brand-400 transition focus-visible:ring-4 capitalize',
                        emojiTab === tab
                          ? 'bg-brand-600 text-white dark:bg-brand-500'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  {(emojiTab === 'sent'
                    ? emojiAnalytics.topSentEmojis
                    : emojiTab === 'received'
                      ? emojiAnalytics.topReceivedEmojis
                      : emojiAnalytics.topEmojis
                  ).map((item, idx) => (
                    <div
                      key={item.emoji}
                      className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"
                    >
                      <span className="text-2xl" style={{ fontSize: `${Math.max(20, 36 - idx * 1.5)}px` }}>{item.emoji}</span>
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{formatNumber(item.count)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {emojiAnalytics.topEmojiUsers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Top Emoji Users</p>
                  <div className="grid grid-cols-2 gap-2">
                    {emojiAnalytics.topEmojiUsers.slice(0, 6).map((user) => (
                      <div key={user.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                        <span className="font-medium dark:text-slate-100 truncate mr-2">{user.name}</span>
                        <span className="flex items-center gap-1 text-slate-500 shrink-0">
                          <span className="text-lg">{user.topEmoji}</span>
                          <span>{formatNumber(user.count)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
        <CompactBarCard title="Hour of Day" data={hourOfDay.map((point) => ({ ...point, label: `${point.hour}:00` }))} dataKey="count" nameKey="label" loading={loadingCharts} onDeepDive={() => navigate('/chats')} />
        <CompactBarCard title="Day of Week" data={dayOfWeek.map((point) => ({ label: point.label, count: point.count }))} dataKey="count" nameKey="label" loading={loadingCharts} onDeepDive={() => navigate('/chats')} />
        <ClickableCard className="dark:border-slate-800 dark:bg-slate-900" onActivate={() => navigate('/chats')} aria-label="Open sent vs received ratio deep dive">
          <CardTitle className="dark:text-slate-50">Monthly Sent vs Received Ratio</CardTitle>
          {loadingCharts ? <Skeleton className="mt-4 h-64" /> : (
            <div className="mt-4 h-64 overflow-x-auto">
              <LineChart width={640} height={256} data={sentReceivedRatio} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip />
                <Line type="monotone" dataKey="sent" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="received" stroke="#0f172a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ratio" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </div>
          )}
        </ClickableCard>
        <ListCard title="Media Breakdown" onDeepDive={() => navigate('/media')}>
          {mediaBreakdown.map((item) => (
            <div key={item.mediaType} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium capitalize dark:text-slate-100">{item.mediaType}</span>
              <span className="text-slate-500">{formatNumber(item.count)} · {formatBytes(item.totalBytes)}</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Media Senders" onDeepDive={() => navigate('/media')}>
          {mediaSenders.map((sender) => (
            <div key={sender.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium dark:text-slate-100">{sender.name}</span>
              <span className="text-slate-500">{formatNumber(sender.mediaCount)} files</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Response Times" onDeepDive={() => navigate('/chats')}>
          {responseTimes.map((item) => (
            <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium dark:text-slate-100">{item.name}</span>
              <span className="text-slate-500">{Math.round(item.averageSeconds / 60)} min avg</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Group Activity" onDeepDive={() => navigate('/chats')}>
          {groupActivity.map((item) => (
            <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium dark:text-slate-100">{item.name}</span>
              <span className="text-slate-500">{formatNumber(item.messageCount)} messages · {item.participantCount} people</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Streaks" onDeepDive={() => navigate('/chats')}>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Current" value={`${streaks?.currentStreak ?? 0} days`} loading={loadingCharts} />
            <StatCard label="Longest" value={`${streaks?.longestStreak ?? 0} days`} loading={loadingCharts} />
          </div>
        </ListCard>
        <ListCard title="Word Cloud" onDeepDive={() => navigate('/search')}>
          <div
            role="presentation"
            className="space-y-3"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const tablist = event.currentTarget.querySelector('[role="tablist"]');
              const targetNode = event.target as Node | null;
              if (tablist && targetNode && tablist.contains(targetNode)) {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.stopPropagation();
                }
              }
            }}
          >
            <div role="tablist" aria-label="Word cloud mode" className="flex flex-wrap gap-2">
              <button
                type="button"
                role="tab"
                aria-selected={wordCloudTab === 'useful'}
                aria-controls="word-cloud-panel"
                id="word-cloud-tab-useful"
                onClick={() => setWordCloudTab('useful')}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-semibold outline-none ring-brand-400 transition focus-visible:ring-4',
                  wordCloudTab === 'useful'
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
                )}
              >
                Useful words
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={wordCloudTab === 'all'}
                aria-controls="word-cloud-panel"
                id="word-cloud-tab-all"
                onClick={() => setWordCloudTab('all')}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-semibold outline-none ring-brand-400 transition focus-visible:ring-4',
                  wordCloudTab === 'all'
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
                )}
              >
                All words
              </button>
            </div>
            {loadingCharts || (wordCloudTab === 'all' && loadingWordCloudAll) ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : (
              <div
                id="word-cloud-panel"
                role="tabpanel"
                aria-labelledby={wordCloudTab === 'all' ? 'word-cloud-tab-all' : 'word-cloud-tab-useful'}
                className="flex flex-wrap gap-2"
              >
                {(wordCloudTab === 'all' ? wordCloudAll : wordCloudUseful).map((term) => (
                  <button
                    key={term.text}
                    type="button"
                    onClick={() => openWordSearch(term.text)}
                    className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 transition hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/40 dark:bg-brand-600/20 dark:text-brand-50 dark:hover:bg-brand-600/30"
                    style={{ fontSize: `${Math.min(24, 12 + term.value * 2)}px` }}
                    aria-label={`Search for ${term.text}`}
                  >
                    {term.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ListCard>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Conversation Dynamics & Relationship Insights</h2>
        {loadingCharts || !conversationDynamics ? (
          <div className="grid grid-cols-2 gap-6">
            <Card className="dark:border-slate-800 dark:bg-slate-900"><Skeleton className="h-64" /></Card>
            <Card className="dark:border-slate-800 dark:bg-slate-900"><Skeleton className="h-64" /></Card>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {conversationDynamics.initiationRatio.length > 0 && (
              <Card className="dark:border-slate-800 dark:bg-slate-900">
                <CardTitle className="dark:text-slate-50">Who Starts Conversations</CardTitle>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Who fires the first message per chat (sessions with 4h+ gap)</p>
                <div className="mt-4 space-y-3">
                  {conversationDynamics.initiationRatio.map((item) => {
                    const mePct = Math.round(item.ratio * 100);
                    const themPct = 100 - mePct;
                    return (
                      <div key={item.jid} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium dark:text-slate-100 truncate mr-2">{item.name}</span>
                          <span className="text-xs text-slate-500 shrink-0">
                            You {item.initiatedByMe} · Them {item.initiatedByThem}
                          </span>
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="bg-brand-500 transition-all duration-500"
                            style={{ width: `${mePct}%` }}
                            title={`You: ${mePct}%`}
                          />
                          <div
                            className="bg-slate-400 dark:bg-slate-500 transition-all duration-500"
                            style={{ width: `${themPct}%` }}
                            title={`Them: ${themPct}%`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-4 pt-1 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-brand-500" /> You</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" /> Them</span>
                  </div>
                </div>
              </Card>
            )}

            {conversationDynamics.conversationDepth.length > 0 && (
              <Card className="dark:border-slate-800 dark:bg-slate-900">
                <CardTitle className="dark:text-slate-50">Conversation Depth</CardTitle>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Average messages per conversation session</p>
                <div className="mt-4 space-y-2">
                  {conversationDynamics.conversationDepth.map((item) => {
                    const maxDepth = conversationDynamics.conversationDepth[0]?.avgMessagesPerSession ?? 1;
                    const barPct = Math.round((item.avgMessagesPerSession / maxDepth) * 100);
                    return (
                      <div key={item.jid} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium dark:text-slate-100 truncate mr-2">{item.name}</span>
                          <span className="text-xs text-slate-500 shrink-0">
                            {item.avgMessagesPerSession} msgs · {item.totalSessions} sessions
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {conversationDynamics.ghostScore.length > 0 && (
              <Card className="dark:border-slate-800 dark:bg-slate-900">
                <CardTitle className="dark:text-slate-50">Ghost Score</CardTitle>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Messages you sent without a reply within 24 hours</p>
                <div className="mt-4 space-y-2">
                  {conversationDynamics.ghostScore.map((item) => {
                    const pct = Math.round(item.ghostRate * 100);
                    const color = pct > 60 ? 'bg-red-500' : pct > 30 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                        <span className="font-medium dark:text-slate-100 truncate mr-2">{item.name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
                          <span className="text-slate-500">{pct}% ghosted</span>
                          <span className="text-xs text-slate-400">({item.ghostedCount}/{item.totalSent})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {conversationDynamics.lateNightTexters.length > 0 && (
              <Card className="dark:border-slate-800 dark:bg-slate-900">
                <CardTitle className="dark:text-slate-50">Late-Night Texters</CardTitle>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Who you talk to after midnight (12am-5am)</p>
                <div className="mt-4 space-y-2">
                  {conversationDynamics.lateNightTexters.map((item) => (
                    <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                      <span className="font-medium dark:text-slate-100 truncate mr-2">{item.name}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-indigo-500 font-semibold">{item.lateNightPct}%</span>
                        <span className="text-xs text-slate-400">
                          {item.lateNight} late · {item.workHours} work · {item.otherHours} other
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {conversationDynamics.relationshipTrajectory.length > 0 && (
              <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
                <CardTitle className="dark:text-slate-50">Relationship Trajectory</CardTitle>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Message frequency trend over months — growing closer or drifting apart?</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {conversationDynamics.relationshipTrajectory.map((item) => {
                    const dirColor = item.direction === 'growing' ? 'text-emerald-500' : item.direction === 'fading' ? 'text-red-400' : 'text-slate-400';
                    const dirLabel = item.direction === 'growing' ? 'Growing closer' : item.direction === 'fading' ? 'Drifting apart' : 'Stable';
                    const strokeColor = item.direction === 'growing' ? '#22c55e' : item.direction === 'fading' ? '#f87171' : '#94a3b8';
                    const fillColor = item.direction === 'growing' ? '#22c55e20' : item.direction === 'fading' ? '#f8717120' : '#94a3b820';
                    return (
                      <div key={item.jid} className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium dark:text-slate-100 truncate mr-2">{item.name}</span>
                          <span className={cn('text-xs font-semibold', dirColor)}>{dirLabel}</span>
                        </div>
                        <div className="h-12">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={item.trend} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                              <Area
                                type="monotone"
                                dataKey="count"
                                stroke={strokeColor}
                                fill={fillColor}
                                strokeWidth={1.5}
                                dot={false}
                              />
                              <Tooltip
                                contentStyle={{ fontSize: '11px', padding: '4px 8px', borderRadius: '8px' }}
                                labelFormatter={(label) => String(label)}
                                formatter={(value) => [`${value} msgs`, '']}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}
      </section>
    </main>
    </>
  );
}

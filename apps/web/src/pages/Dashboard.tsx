import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { ActivityHeatmap } from '../components/charts/ActivityHeatmap';
import { MessageVolumeArea } from '../components/charts/MessageVolumeArea';
import { TopContactsBar } from '../components/charts/TopContactsBar';
import { Card, CardTitle, Skeleton } from '../components/ui/Card';
import {
  api,
  type ActivityHeatmapPoint,
  type DayOfWeekStat,
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
import { formatBytes, formatNumber } from '../lib/utils';
import { useAppStore } from '../store/appStore';

function formatDateRange(stats: OverviewStats | null): string {
  if (!stats?.oldestMessage || !stats.newestMessage) {
    return 'No archive dates yet';
  }

  return `${format(new Date(stats.oldestMessage), 'MMM yyyy')} -> ${format(new Date(stats.newestMessage), 'MMM yyyy')}`;
}

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card className="p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-3 h-8 w-24" /> : <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>}
    </Card>
  );
}

function CompactBarCard({ title, data, dataKey, nameKey, loading }: { title: string; data: Array<Record<string, string | number>>; dataKey: string; nameKey: string; loading: boolean }) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
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
    </Card>
  );
}

function ListCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">{title}</CardTitle>
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
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
  const [wordCloud, setWordCloud] = useState<WordCloudTerm[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const heatmapYear = useMemo(() => new Date().getFullYear(), []);

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
      api.wordCloud(period, 30),
    ])
      .then(([contacts, volume, activity, hours, weekdays, mediaTypes, senders, ratio, responses, groups, streakData, words]) => {
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
        setWordCloud(words);
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
    <main className="space-y-6 p-8">
      <section className="grid grid-cols-5 gap-4">
        <StatCard label="Messages" value={formatNumber(overview?.totalMessages ?? 0)} loading={loadingOverview} />
        <StatCard label="Chats" value={formatNumber(overview?.totalChats ?? 0)} loading={loadingOverview} />
        <StatCard label="Contacts" value={formatNumber(overview?.totalContacts ?? 0)} loading={loadingOverview} />
        <StatCard label="Media Files" value={formatNumber(overview?.totalMediaFiles ?? 0)} loading={loadingOverview} />
        <StatCard label="Archive Range" value={formatDateRange(overview)} loading={loadingOverview} />
      </section>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      ) : null}

      <section className="grid grid-cols-2 gap-6">
        <MessageVolumeArea data={messageVolume} loading={loadingCharts} />
        <TopContactsBar data={topContacts} loading={loadingCharts} onContactClick={(jid) => navigate(`/chats?contact=${encodeURIComponent(jid)}`)} />
        <ActivityHeatmap data={heatmap} loading={loadingCharts} year={heatmapYear} />
        <CompactBarCard title="Hour of Day" data={hourOfDay.map((point) => ({ ...point, label: `${point.hour}:00` }))} dataKey="count" nameKey="label" loading={loadingCharts} />
        <CompactBarCard title="Day of Week" data={dayOfWeek.map((point) => ({ label: point.label, count: point.count }))} dataKey="count" nameKey="label" loading={loadingCharts} />
        <Card className="dark:border-slate-800 dark:bg-slate-900">
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
        </Card>
        <ListCard title="Media Breakdown">
          {mediaBreakdown.map((item) => (
            <div key={item.mediaType} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium capitalize dark:text-slate-100">{item.mediaType}</span>
              <span className="text-slate-500">{formatNumber(item.count)} · {formatBytes(item.totalBytes)}</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Media Senders">
          {mediaSenders.map((sender) => (
            <div key={sender.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium dark:text-slate-100">{sender.name}</span>
              <span className="text-slate-500">{formatNumber(sender.mediaCount)} files</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Response Times">
          {responseTimes.map((item) => (
            <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium dark:text-slate-100">{item.name}</span>
              <span className="text-slate-500">{Math.round(item.averageSeconds / 60)} min avg</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Group Activity">
          {groupActivity.map((item) => (
            <div key={item.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium dark:text-slate-100">{item.name}</span>
              <span className="text-slate-500">{formatNumber(item.messageCount)} messages · {item.participantCount} people</span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Streaks">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Current" value={`${streaks?.currentStreak ?? 0} days`} loading={loadingCharts} />
            <StatCard label="Longest" value={`${streaks?.longestStreak ?? 0} days`} loading={loadingCharts} />
          </div>
        </ListCard>
        <ListCard title="Word Cloud">
          <div className="flex flex-wrap gap-2">
            {wordCloud.map((term) => (
              <span key={term.text} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 dark:bg-brand-600/20 dark:text-brand-50" style={{ fontSize: `${Math.min(24, 12 + term.value * 2)}px` }}>
                {term.text}
              </span>
            ))}
          </div>
        </ListCard>
      </section>
    </main>
  );
}

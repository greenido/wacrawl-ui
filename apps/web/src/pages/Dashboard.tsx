import { format } from 'date-fns';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import type { OverviewStats } from '../api/client';
import { ActivityHeatmap } from '../components/charts/ActivityHeatmap';
import { MessageVolumeArea } from '../components/charts/MessageVolumeArea';
import { TopContactsBar } from '../components/charts/TopContactsBar';
import { ConversationDynamicsSection } from '../components/reports/ConversationDynamicsSection';
import { DormancyCard } from '../components/reports/DormancyCard';
import { EmojiAnalyticsCard } from '../components/reports/EmojiAnalyticsCard';
import { ReplyLatencyCard } from '../components/reports/ReplyLatencyCard';
import { WordCloudCard } from '../components/reports/WordCloudCard';
import { CardTitle, ClickableCard, Skeleton } from '../components/ui/Card';
import { CompactBarCard, ListCard, ListRow, StatCard } from '../components/ui/cards';
import { QuotesLoader } from '../components/ui/QuotesLoader';
import { useDashboardData } from '../hooks/useDashboardData';
import { formatBytes, formatDuration, formatNumber } from '../lib/utils';
import { useAppStore } from '../store/appStore';

function formatDateRange(stats: OverviewStats | null): string {
  if (!stats?.oldestMessage || !stats.newestMessage) {
    return 'No archive dates yet';
  }

  return `${format(new Date(stats.oldestMessage), 'MMM yyyy')} -> ${format(new Date(stats.newestMessage), 'MMM yyyy')}`;
}

export function Dashboard() {
  const navigate = useNavigate();
  const period = useAppStore((state) => state.period);
  const data = useDashboardData();
  const {
    overview, topContacts, messageVolume, heatmap, hourOfDay, dayOfWeek, mediaBreakdown,
    mediaSenders, sentReceivedRatio, responseTimes, replyLatency, groupActivity, streaks,
    wordCloud, emojiAnalytics, conversationDynamics, dormancy, heatmapYear,
    loadingOverview, loadingCharts, error,
  } = data;

  const openContact = (jid: string) => navigate(`/contacts/${encodeURIComponent(jid)}`);

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
          <StatCard label="Archive Range" value={formatDateRange(overview)} loading={loadingOverview} onDeepDive={() => navigate('/years')} />
        </section>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
        ) : null}

        <section className="grid grid-cols-2 gap-6">
          <MessageVolumeArea data={messageVolume} loading={loadingCharts} onDeepDive={() => navigate('/chats')} />
          <TopContactsBar data={topContacts} loading={loadingCharts} onContactClick={openContact} onDeepDive={() => navigate('/people')} />
          <ActivityHeatmap data={heatmap} loading={loadingCharts} year={heatmapYear} onDeepDive={() => navigate(`/years/${heatmapYear}`)} />
          <DormancyCard data={dormancy} loading={loadingCharts} onOpenContact={openContact} />

          <ReplyLatencyCard data={replyLatency} loading={loadingCharts} />
          <EmojiAnalyticsCard data={emojiAnalytics} loading={loadingCharts} />

          <CompactBarCard
            title="Hour of Day"
            data={hourOfDay.map((point) => ({ ...point, label: `${point.hour}:00` }))}
            dataKey="count"
            nameKey="label"
            loading={loadingCharts}
            onDeepDive={() => navigate('/chats')}
          />
          <CompactBarCard
            title="Day of Week"
            data={dayOfWeek.map((point) => ({ label: point.label, count: point.count }))}
            dataKey="count"
            nameKey="label"
            loading={loadingCharts}
            onDeepDive={() => navigate('/chats')}
          />

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
              <ListRow
                key={item.mediaType}
                label={<span className="capitalize">{item.mediaType}</span>}
                value={`${formatNumber(item.count)} · ${formatBytes(item.totalBytes)}`}
              />
            ))}
          </ListCard>

          <ListCard title="Media Senders" onDeepDive={() => navigate('/media')}>
            {mediaSenders.map((sender) => (
              <ListRow key={sender.jid} label={sender.name} value={`${formatNumber(sender.mediaCount)} files`} />
            ))}
          </ListCard>

          <ListCard title="Response Times" hint="Median turnaround, each side separately — chats with fewer than 5 exchanges are excluded">
            {responseTimes.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                No chat in this period has enough back-and-forth to measure.
              </p>
            ) : responseTimes.map((item) => (
              <ListRow
                key={item.jid}
                label={item.name}
                value={`you ${formatDuration(item.myMedianSeconds)} · them ${formatDuration(item.theirMedianSeconds)}`}
                title={`p90 ${formatDuration(item.p90Seconds)} over ${item.responseCount} replies`}
              />
            ))}
          </ListCard>

          <ListCard title="Group Activity" onDeepDive={() => navigate('/groups')}>
            {groupActivity.map((item) => (
              <ListRow
                key={item.jid}
                label={
                  <Link
                    to={`/groups/${encodeURIComponent(item.jid)}`}
                    onClick={(event) => event.stopPropagation()}
                    className="underline-offset-2 hover:underline"
                  >
                    {item.name}
                  </Link>
                }
                value={`${formatNumber(item.messageCount)} messages · ${item.participantCount} talking`}
              />
            ))}
          </ListCard>

          <ListCard title="Streaks" onDeepDive={() => navigate('/chats')}>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Current" value={`${streaks?.currentStreak ?? 0} days`} loading={loadingCharts} />
              <StatCard label="Longest" value={`${streaks?.longestStreak ?? 0} days`} loading={loadingCharts} />
            </div>
          </ListCard>

          <WordCloudCard
            useful={wordCloud}
            loading={loadingCharts}
            period={period}
            onSelectTerm={(term) => navigate(`/search?q=${encodeURIComponent(term)}`)}
          />
        </section>

        <ConversationDynamicsSection data={conversationDynamics} loading={loadingCharts} onOpenContact={openContact} />
      </main>
    </>
  );
}

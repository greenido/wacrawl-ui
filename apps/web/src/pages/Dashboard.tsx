import { format } from 'date-fns';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { defaultVolumeGranularity, type OverviewStats } from '../api/client';
import { ActivityHeatmap } from '../components/charts/ActivityHeatmap';
import { clickedRow } from '../components/charts/chartClick';
import { MessageVolumeArea } from '../components/charts/MessageVolumeArea';
import { TopContactsBar } from '../components/charts/TopContactsBar';
import { ArchivedChatsCard } from '../components/reports/ArchivedChatsCard';
import { ConversationDynamicsSection } from '../components/reports/ConversationDynamicsSection';
import { DistinctiveWordsCard } from '../components/reports/DistinctiveWordsCard';
import { DormancyCard } from '../components/reports/DormancyCard';
import { EmojiAnalyticsCard } from '../components/reports/EmojiAnalyticsCard';
import { GroupGraveyardCard } from '../components/reports/GroupGraveyardCard';
import { ReplyLatencyCard } from '../components/reports/ReplyLatencyCard';
import { WeeklyRhythmCard } from '../components/reports/WeeklyRhythmCard';
import { WordCloudCard } from '../components/reports/WordCloudCard';
import { Card, CardTitle, Skeleton } from '../components/ui/Card';
import { CompactBarCard, ListCard, ListRow, StatCard } from '../components/ui/cards';
import { QuotesLoader } from '../components/ui/QuotesLoader';
import { useDashboardData } from '../hooks/useDashboardData';
import { bucketRange, searchPath } from '../lib/searchLinks';
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
    wordCloud, emojiAnalytics, conversationDynamics, dormancy, weeklyRhythm, distinctiveWords,
    groupLifecycle, archivedChats, heatmapYear,
    loadingOverview, loadingCharts, error,
  } = data;

  const openContact = (jid: string) => navigate(`/contacts/${encodeURIComponent(jid)}`);
  const openGroup = (jid: string) => navigate(`/groups/${encodeURIComponent(jid)}`);
  const openChat = (jid: string) => navigate(`/chats?contact=${encodeURIComponent(jid)}`);
  const searchTerm = (term: string) => navigate(searchPath({ q: term, period }));
  // Every report below is scoped to the period, so the messages behind it are too.
  const messagesPath = (filters: Parameters<typeof searchPath>[0]) => searchPath({ ...filters, period });
  const openBucket = (date: string, granularity: 'day' | 'month') => navigate(messagesPath(bucketRange(date, granularity)));

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
          <MessageVolumeArea
            data={messageVolume}
            loading={loadingCharts}
            onSelectDate={(date) => openBucket(date, defaultVolumeGranularity(period))}
          />
          <TopContactsBar
            data={topContacts}
            loading={loadingCharts}
            onContactClick={(jid) => navigate(messagesPath({ contact: jid }))}
          />
          {/* The heatmap is the calendar year whatever the period says, so its days are not scoped to it. */}
          <ActivityHeatmap
            data={heatmap}
            loading={loadingCharts}
            year={heatmapYear}
            dayPath={(date) => searchPath({ from: date, to: date })}
            yearPath={`/years/${heatmapYear}`}
          />
          <WeeklyRhythmCard
            data={weeklyRhythm}
            loading={loadingCharts}
            slotPath={(weekday, hour) => messagesPath({ weekday, hour })}
          />
          <DormancyCard data={dormancy} loading={loadingCharts} onOpenContact={openContact} />
          <ArchivedChatsCard data={archivedChats} loading={loadingCharts} onOpenChat={openChat} />

          <ReplyLatencyCard data={replyLatency} loading={loadingCharts} />
          <EmojiAnalyticsCard data={emojiAnalytics} loading={loadingCharts} />

          <CompactBarCard
            title="Hour of Day"
            hint="Click a bar to see the messages sent in that hour"
            data={hourOfDay.map((point) => ({ ...point, label: `${point.hour}:00` }))}
            dataKey="count"
            nameKey="label"
            loading={loadingCharts}
            onSelectRow={(row) => navigate(messagesPath({ hour: row.hour }))}
          />
          <CompactBarCard
            title="Day of Week"
            hint="Click a bar to see the messages sent on that day"
            data={dayOfWeek}
            dataKey="count"
            nameKey="label"
            loading={loadingCharts}
            onSelectRow={(row) => navigate(messagesPath({ weekday: row.day }))}
          />

          <Card className="dark:border-slate-800 dark:bg-slate-900">
            <CardTitle className="dark:text-slate-50">Monthly Sent vs Received Ratio</CardTitle>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Click a month to see its messages</p>
            {loadingCharts ? <Skeleton className="mt-4 h-64" /> : (
              <div className="mt-4 h-64 overflow-x-auto">
                <LineChart
                  width={640}
                  height={256}
                  data={sentReceivedRatio}
                  margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const point = clickedRow(sentReceivedRatio, state);
                    if (point) openBucket(point.month, 'month');
                  }}
                >
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
              <ListRow
                key={item.mediaType}
                to={messagesPath({ mediaType: item.mediaType })}
                label={<span className="capitalize">{item.mediaType}</span>}
                value={`${formatNumber(item.count)} · ${formatBytes(item.totalBytes)}`}
              />
            ))}
          </ListCard>

          <ListCard title="Media Senders">
            {mediaSenders.map((sender) => (
              <ListRow
                key={sender.jid}
                to={messagesPath({ contact: sender.jid, mediaType: 'any' })}
                label={sender.name}
                value={`${formatNumber(sender.mediaCount)} files`}
              />
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

          <ListCard title="Group Activity">
            {groupActivity.map((item) => (
              <ListRow
                key={item.jid}
                label={
                  <Link to={`/groups/${encodeURIComponent(item.jid)}`} className="underline-offset-2 hover:underline">
                    {item.name}
                  </Link>
                }
                value={
                  <>
                    <Link to={messagesPath({ chat: item.jid })} className="underline-offset-2 hover:underline">
                      {formatNumber(item.messageCount)} messages
                    </Link>
                    {` · ${item.participantCount} talking`}
                  </>
                }
              />
            ))}
          </ListCard>

          <ListCard title="Streaks">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Current" value={`${streaks?.currentStreak ?? 0} days`} loading={loadingCharts} />
              <StatCard label="Longest" value={`${streaks?.longestStreak ?? 0} days`} loading={loadingCharts} />
            </div>
          </ListCard>

          <WordCloudCard
            useful={wordCloud}
            loading={loadingCharts}
            period={period}
            onSelectTerm={searchTerm}
          />

          <DistinctiveWordsCard data={distinctiveWords} loading={loadingCharts} onSelectTerm={searchTerm} />
          <GroupGraveyardCard data={groupLifecycle} loading={loadingCharts} onOpenGroup={openGroup} />
        </section>

        <ConversationDynamicsSection data={conversationDynamics} loading={loadingCharts} onOpenContact={openContact} />
      </main>
    </>
  );
}

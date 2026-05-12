import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { ActivityHeatmap } from '../components/charts/ActivityHeatmap';
import { MessageVolumeArea } from '../components/charts/MessageVolumeArea';
import { TopContactsBar } from '../components/charts/TopContactsBar';
import { Card, Skeleton } from '../components/ui/Card';
import { api, type ActivityHeatmapPoint, type MessageVolumePoint, type OverviewStats, type TopContact } from '../api/client';
import { formatNumber } from '../lib/utils';
import { useAppStore } from '../store/appStore';

function formatDateRange(stats: OverviewStats | null): string {
  if (!stats?.oldestMessage || !stats.newestMessage) {
    return 'No archive dates yet';
  }

  return `${format(new Date(stats.oldestMessage), 'MMM yyyy')} -> ${format(new Date(stats.newestMessage), 'MMM yyyy')}`;
}

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-3 h-8 w-24" /> : <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>}
    </Card>
  );
}

export function Dashboard() {
  const period = useAppStore((state) => state.period);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [topContacts, setTopContacts] = useState<TopContact[]>([]);
  const [messageVolume, setMessageVolume] = useState<MessageVolumePoint[]>([]);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapPoint[]>([]);
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
    ])
      .then(([contacts, volume, activity]) => {
        if (!active) return;
        setTopContacts(contacts);
        setMessageVolume(volume);
        setHeatmap(activity);
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
        <TopContactsBar data={topContacts} loading={loadingCharts} />
        <ActivityHeatmap data={heatmap} loading={loadingCharts} year={heatmapYear} />
      </section>
    </main>
  );
}

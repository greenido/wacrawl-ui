import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReplyLatencyDistribution } from '../../api/client';
import { formatDuration, formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';
import { ScanNote } from '../ui/ScanNote';

/**
 * The distribution behind the Response Times leaderboard.
 *
 * A single average cannot describe reply gaps — they run from seconds to weeks
 * — so the shape and the two medians are the honest summary.
 */
export function ReplyLatencyCard({ data, loading }: { data: ReplyLatencyDistribution | null; loading: boolean }) {
  return (
    <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">How Fast Replies Happen</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Every gap where the conversation changed hands, split by who was replying
      </p>
      {loading || !data ? <Skeleton className="mt-4 h-64" /> : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Summary label="You" side={data.mine} accent="text-brand-600 dark:text-brand-400" />
            <Summary label="Them" side={data.theirs} accent="text-slate-600 dark:text-slate-300" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.buckets} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(value) => formatNumber(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar name="You" dataKey="mine" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar name="Them" dataKey="theirs" fill="#64748b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ScanNote scan={data.scan} unit="replies" />
        </div>
      )}
    </Card>
  );
}

function Summary({ label, side, accent }: { label: string; side: ReplyLatencyDistribution['mine']; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800">
      <span className={`font-semibold ${accent}`}>{label}</span>
      <span className="ml-2 text-slate-500 dark:text-slate-400">
        median {formatDuration(side.medianSeconds)} · p90 {formatDuration(side.p90Seconds)} · {formatNumber(side.count)} replies
      </span>
    </div>
  );
}

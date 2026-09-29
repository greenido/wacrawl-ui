import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import type { GroupLifecycle } from '../../api/client';
import { formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';

interface GroupGraveyardCardProps {
  data: GroupLifecycle | null;
  loading: boolean;
  onOpenGroup: (jid: string) => void;
}

function formatAge(days: number): string {
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="truncate text-lg font-semibold text-slate-950 dark:text-slate-50">{value}</p>
      {detail ? <p className="truncate text-[11px] text-slate-400" title={detail}>{detail}</p> : null}
    </div>
  );
}

/** Group age, founding years, and the groups that stopped talking. */
export function GroupGraveyardCard({ data, loading, onOpenGroup }: GroupGraveyardCardProps) {
  const deadShare = data && data.totalGroups > 0 ? Math.round((data.deadGroups / data.totalGroups) * 100) : 0;

  return (
    <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Group Graveyard</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {data
          ? `Groups with no message in ${data.dormantDays}+ days, and when your groups were founded`
          : 'Groups that have gone silent, and when your groups were founded'}
      </p>
      {loading || !data ? <Skeleton className="mt-4 h-64" /> : data.totalGroups === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          No groups in this archive.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Figure
                label="Silent"
                value={`${deadShare}%`}
                detail={`${formatNumber(data.deadGroups)} of ${formatNumber(data.totalGroups)} groups`}
              />
              <Figure label="Median age" value={data.medianAgeDays == null ? '—' : formatAge(data.medianAgeDays)} />
              <Figure
                label="Oldest still alive"
                value={data.oldestAlive?.createdAt ? format(new Date(data.oldestAlive.createdAt), 'yyyy') : '—'}
                detail={data.oldestAlive?.name}
              />
            </div>
            {data.foundedByYear.length > 0 ? (
              <div className="overflow-x-auto">
                <BarChart width={500} height={200} data={data.foundedByYear} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="alive" name="Still active" stackId="groups" fill="#22c55e" />
                  <Bar dataKey="dead" name="Silent" stackId="groups" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Once the loudest</h3>
            <div className="mt-2 space-y-2">
              {data.graveyard.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Every group you have messages from is still active.
                </p>
              ) : data.graveyard.map((group) => (
                <div key={group.jid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => onOpenGroup(group.jid)}
                    className="mr-2 truncate text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-100"
                  >
                    {group.name}
                  </button>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatNumber(group.messageCount)} msgs
                    {group.daysSilent != null ? ` · silent ${formatAge(group.daysSilent)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

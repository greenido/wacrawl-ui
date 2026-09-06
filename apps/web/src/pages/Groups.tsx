import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type GroupDirectoryEntry, type GroupSort } from '../api/client';
import { Card, Skeleton } from '../components/ui/Card';
import { cn, formatDateTime, formatNumber } from '../lib/utils';
import { useAppStore } from '../store/appStore';

const SORTS: Array<{ value: GroupSort; label: string }> = [
  { value: 'recent', label: 'Recently active' },
  { value: 'members', label: 'Most members' },
  { value: 'messages', label: 'Most messages' },
];

export function Groups() {
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [sort, setSort] = useState<GroupSort>('recent');
  const [groups, setGroups] = useState<GroupDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api.groups(sort)
      .then((result) => {
        if (active) setGroups(result);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dataVersion, sort]);

  return (
    <main className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Groups</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every group in the archive, with the roster size the chat list cannot show.
          </p>
        </div>
        <div className="flex gap-2">
          {SORTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-semibold transition',
                option.value === sort
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <Card className="overflow-hidden p-0 dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : groups.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No groups in this archive.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {groups.map((group) => (
              <Link
                key={group.jid}
                to={`/groups/${encodeURIComponent(group.jid)}`}
                className="flex items-center justify-between gap-4 p-5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-950 dark:text-slate-50">{group.name}</h3>
                  <p className="text-sm text-slate-500">Last message: {formatDateTime(group.lastMessageAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-6 text-right text-sm">
                  <Figure
                    label="Members"
                    value={group.memberCount == null ? '—' : formatNumber(group.memberCount)}
                    icon
                  />
                  <Figure label="Messages" value={formatNumber(group.messageCount)} />
                  <Figure
                    label="Mine"
                    value={group.sentByMe === 0 ? 'None' : formatNumber(group.sentByMe)}
                    muted={group.sentByMe === 0}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

function Figure({ label, value, icon, muted }: { label: string; value: string; icon?: boolean; muted?: boolean }) {
  return (
    <div className="w-20">
      <p className={cn(
        'flex items-center justify-end gap-1 font-semibold',
        muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-950 dark:text-slate-50',
      )}>
        {icon ? <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden /> : null}
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

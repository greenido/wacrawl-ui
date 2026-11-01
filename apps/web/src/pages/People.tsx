import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PersonSummary } from '../api/client';
import { Card, Skeleton } from '../components/ui/Card';
import { FilterInput } from '../components/ui/FilterInput';
import { useUrlTextFilter } from '../hooks/useUrlTextFilter';
import { formatDateTime, formatNumber, isLidIdentifier } from '../lib/utils';
import { useAppStore } from '../store/appStore';

const PAGE_SIZE = 100;

export function People() {
  const dataVersion = useAppStore((state) => state.dataVersion);
  const { value: filter, setValue: setFilter, applied: appliedFilter } = useUrlTextFilter();
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.people(PAGE_SIZE, 0, { q: appliedFilter })
      .then((result) => {
        if (!active) return;
        setPeople(result.data);
        setTotal(result.pagination.total);
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
  }, [appliedFilter, dataVersion]);

  function loadMore() {
    setLoadingMore(true);
    api.people(PAGE_SIZE, people.length, { q: appliedFilter })
      .then((result) => {
        setPeople((previous) => {
          const seen = new Set(previous.map((person) => person.jid));
          return [...previous, ...result.data.filter((person) => !seen.has(person.jid))];
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingMore(false));
  }

  return (
    <main className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">People</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Contacts ranked by message activity across the local archive{loading ? '' : ` · ${formatNumber(total)} ${appliedFilter ? 'matching' : 'in total'}`}.
          </p>
        </div>
        <FilterInput value={filter} onChange={setFilter} placeholder="Filter by name" className="w-64" />
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <Card className="overflow-hidden p-0 dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : people.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            {appliedFilter ? `No people match “${appliedFilter}”.` : 'No people found in the archive.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {people.map((person) => (
              <Link
                key={person.jid}
                to={`/contacts/${encodeURIComponent(person.jid)}`}
                className="grid grid-cols-[1fr_auto] gap-4 p-5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <div>
                  <h3 className="font-semibold text-slate-950 dark:text-slate-50">{person.name}</h3>
                  {!isLidIdentifier(person.jid) ? <p className="text-sm text-slate-500">{person.jid}</p> : null}
                  <p className="mt-2 text-sm text-slate-500">Last message: {formatDateTime(person.lastMessageAt)}</p>
                </div>
                <div className="grid grid-cols-4 gap-3 text-right text-sm">
                  <Metric label="Messages" value={formatNumber(person.messageCount)} />
                  <Metric label="Media" value={formatNumber(person.mediaCount)} />
                  <Metric label="Sent" value={formatNumber(person.sentByMe)} />
                  <Metric label="Received" value={formatNumber(person.sentByThem)} />
                </div>
              </Link>
            ))}
            {people.length < total ? (
              <div className="flex justify-center p-4">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold text-slate-950 dark:text-slate-50">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

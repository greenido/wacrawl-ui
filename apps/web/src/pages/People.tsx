import { useEffect, useState } from 'react';
import { api, type PersonSummary } from '../api/client';
import { Card, Skeleton } from '../components/ui/Card';
import { formatDateTime, formatNumber, isLidIdentifier } from '../lib/utils';

export function People() {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.people(100)
      .then((result) => {
        if (active) setPeople(result.data);
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
  }, []);

  return (
    <main className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">People</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Contacts ranked by message activity across the local archive.</p>
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
          <div className="p-10 text-center text-slate-500">No people found in the archive.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {people.map((person) => (
              <article key={person.jid} className="grid grid-cols-[1fr_auto] gap-4 p-5">
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
              </article>
            ))}
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

import type { DormancyReport } from '../../api/client';
import { Card, CardTitle, Skeleton } from '../ui/Card';

/**
 * Contacts whose traffic collapsed between the baseline and recent windows.
 *
 * Rates are per month so the two windows stay comparable despite being very
 * different lengths.
 */
export function DormancyCard({
  data,
  loading,
  onOpenContact,
}: {
  data: DormancyReport | null;
  loading: boolean;
  onOpenContact: (jid: string) => void;
}) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Drifted Away</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {data
          ? `People you used to message regularly and have gone quiet with, comparing the last ${data.recentDays} days against the ${data.baselineDays - data.recentDays} before them`
          : 'People you used to message regularly and have gone quiet with'}
      </p>
      {loading || !data ? <Skeleton className="mt-4 h-48" /> : (
        <div className="mt-4 space-y-2">
          {data.contacts.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Nobody has dropped off — every chat with a real history is as busy as it was.
            </p>
          ) : data.contacts.map((contact) => (
            <div key={contact.jid} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => onOpenContact(contact.jid)}
                  className="mr-2 truncate text-left font-medium text-slate-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-100"
                >
                  {contact.name}
                </button>
                <span className="shrink-0 text-xs text-slate-500">
                  {contact.baselinePerMonth} → {contact.recentPerMonth} /mo
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${Math.round(contact.dropRatio * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-[11px] text-slate-400">
                  −{Math.round(contact.dropRatio * 100)}% · {contact.daysSinceLastMessage}d quiet
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

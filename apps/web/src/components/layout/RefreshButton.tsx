import { formatDistanceToNowStrict } from 'date-fns';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useArchiveSync } from '../../hooks/useArchiveSync';
import { cn } from '../../lib/utils';

function lastSyncedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return `Synced ${formatDistanceToNowStrict(at, { addSuffix: true })}`;
}

export function RefreshButton() {
  const { enabled, syncing, error, hint, lastImportAt, refresh, dismissError } = useArchiveSync();
  const synced = lastSyncedLabel(lastImportAt);

  return (
    <div className="relative flex items-center gap-3">
      {synced ? (
        <span className="hidden text-xs text-slate-400 dark:text-slate-500 lg:inline" title={lastImportAt ?? undefined}>
          {synced}
        </span>
      ) : null}

      <button
        type="button"
        onClick={refresh}
        disabled={syncing}
        aria-label={enabled ? 'Sync the archive and reload dashboard data' : 'Reload dashboard data'}
        title={enabled
          ? 'Import new WhatsApp messages with wacrawl, then reload the dashboard'
          : 'Archive sync is disabled on the server — this only reloads dashboard data'}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-brand-500 hover:text-slate-950 disabled:cursor-progress disabled:opacity-70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'Syncing' : 'Refresh'}
      </button>

      {error ? (
        <div
          role="alert"
          className="absolute right-0 top-full z-20 mt-2 w-96 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-lg dark:border-amber-500/40 dark:bg-amber-950"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Sync failed</p>
              <p className="break-words text-xs text-amber-900/90 dark:text-amber-200/90">{error}</p>
              {hint ? (
                <p className="break-words text-xs text-amber-800/80 dark:text-amber-200/70">{hint}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={dismissError}
              aria-label="Dismiss sync error"
              className="ml-auto rounded-full p-1 text-amber-700 transition hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

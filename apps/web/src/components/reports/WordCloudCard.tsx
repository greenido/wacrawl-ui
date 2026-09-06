import { useEffect, useState } from 'react';
import { api, type WordCloud } from '../../api/client';
import type { Period } from '../../store/appStore';
import { cn } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';
import { ScanNote } from '../ui/ScanNote';

interface WordCloudCardProps {
  useful: WordCloud | null;
  loading: boolean;
  period: Period;
  onSelectTerm: (term: string) => void;
}

/**
 * The unfiltered list is only fetched when the tab is opened — it is the more
 * expensive of the two and most people never leave the filtered view.
 */
export function WordCloudCard({ useful, loading, period, onSelectTerm }: WordCloudCardProps) {
  const [tab, setTab] = useState<'all' | 'useful'>('useful');
  const [all, setAll] = useState<WordCloud | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    setAll(null);
  }, [period]);

  useEffect(() => {
    if (tab !== 'all' || all !== null) return;
    let active = true;
    setLoadingAll(true);
    api.wordCloud(period, 30, 'all')
      .then((words) => {
        if (active) setAll(words);
      })
      .catch((err: Error) => {
        console.error('Failed to load all word cloud words:', err);
      })
      .finally(() => {
        if (active) setLoadingAll(false);
      });

    return () => {
      active = false;
    };
  }, [tab, period, all]);

  const active = tab === 'all' ? all : useful;
  const busy = loading || (tab === 'all' && loadingAll);

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Word Cloud</CardTitle>
      <div className="mt-4 space-y-3">
        <div role="tablist" aria-label="Word cloud mode" className="flex flex-wrap gap-2">
          {(['useful', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls="word-cloud-panel"
              onClick={() => setTab(value)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-semibold outline-none ring-brand-400 transition focus-visible:ring-4',
                tab === value
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
              )}
            >
              {value === 'useful' ? 'Useful words' : 'All words'}
            </button>
          ))}
        </div>

        {busy ? <Skeleton className="h-24 rounded-xl" /> : (
          <div id="word-cloud-panel" role="tabpanel" className="flex flex-wrap gap-2">
            {(active?.terms ?? []).map((term) => (
              <button
                key={term.text}
                type="button"
                onClick={() => onSelectTerm(term.text)}
                className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 transition hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/40 dark:bg-brand-600/20 dark:text-brand-50 dark:hover:bg-brand-600/30"
                style={{ fontSize: `${Math.min(24, 12 + term.value * 2)}px` }}
                aria-label={`Search for ${term.text}`}
              >
                {term.text}
              </button>
            ))}
          </div>
        )}
        <ScanNote scan={active?.scan} />
      </div>
    </Card>
  );
}

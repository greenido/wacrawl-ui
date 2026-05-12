import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type SearchResult } from '../api/client';
import { Card, Skeleton } from '../components/ui/Card';
import { displayNameOrUnknown, formatDateTime } from '../lib/utils';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      api.search(trimmed, 50)
        .then((result) => {
          if (active) setResults(result.data);
        })
        .catch((err: Error) => {
          if (active) setError(err.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <main className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Search</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Search message text, chat names, and sender names. Queries run against the local SQLite archive.</p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search messages..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-lg shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
        />
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <Card className="min-h-72 dark:border-slate-800 dark:bg-slate-900">
        {query.trim().length < 2 ? (
          <div className="flex h-56 items-center justify-center text-slate-500">Type at least two characters to search.</div>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-slate-500">No results for “{query}”.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {results.map((result) => (
              <article key={result.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">{result.chatName}</h3>
                    <p className="text-sm text-slate-500">{result.fromMe ? 'Me' : displayNameOrUnknown(result.senderName, result.senderJid)} · {formatDateTime(result.sentAt)}</p>
                  </div>
                  {result.mediaType ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{result.mediaType}</span> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{result.snippet || '[No text]'}</p>
              </article>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

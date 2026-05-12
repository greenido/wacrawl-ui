import { Music, Search as SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { absoluteApiUrl, api, type SearchResult } from '../api/client';
import { TextWithLinks } from '../components/MessageContent';
import { Card, Skeleton } from '../components/ui/Card';
import { CopyButton } from '../components/ui/CopyButton';
import { MediaPlaceholder, useMediaError } from '../components/ui/MediaPlaceholder';
import { humanizeMixedSnippet, resolveMediaPreviewKind, searchHitClipboardText } from '../lib/messageMedia';
import { displayNameOrUnknown, formatDateTime } from '../lib/utils';

function SearchHitBody({ result }: { result: SearchResult }) {
  const kind = resolveMediaPreviewKind(result.mediaType, result.mediaPath);
  const path = result.mediaPath?.trim();
  const fileUrl = path ? absoluteApiUrl(`/api/media/file?path=${encodeURIComponent(path)}`) : null;
  const showThumb = Boolean(fileUrl && (kind === 'image' || kind === 'video'));
  const { failed, onError } = useMediaError();

  const snippetRaw = result.snippet?.trim() ?? '';
  const snippetDisplay = snippetRaw ? humanizeMixedSnippet(result.snippet!, result.mediaType) : null;

  return (
    <div className="mt-3 flex gap-3">
      {showThumb && fileUrl ? (
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          {failed ? (
            <MediaPlaceholder className="h-full w-full" />
          ) : kind === 'image' ? (
            <img src={fileUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={onError} />
          ) : (
            <video src={fileUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" onError={onError} />
          )}
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-2">
        {snippetDisplay ? (
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            <TextWithLinks text={snippetDisplay} />
          </p>
        ) : fileUrl ? null : (
          <p className="text-sm text-slate-500 dark:text-slate-400">[No text]</p>
        )}
        {fileUrl && kind === 'audio' ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/80">
            <Music className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-400" aria-hidden />
            <audio src={fileUrl} className="min-w-0 flex-1" controls preload="metadata" />
          </div>
        ) : null}
        {fileUrl && kind === 'other' ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            Open attachment
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextQuery = searchParams.get('q') ?? '';
    setQuery((currentQuery) => (currentQuery === nextQuery ? currentQuery : nextQuery));
  }, [searchParams]);

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
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setSearchParams(nextQuery.trim() ? { q: nextQuery } : {});
          }}
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
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-950 dark:text-slate-50">{result.chatName}</h3>
                    <p className="text-sm text-slate-500">{result.fromMe ? 'Me' : displayNameOrUnknown(result.senderName, result.senderJid)} · {formatDateTime(result.sentAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <CopyButton text={searchHitClipboardText(result.snippet, result.text, result.mediaType)} />
                    {result.mediaType ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{result.mediaType}</span> : null}
                  </div>
                </div>
                <SearchHitBody result={result} />
              </article>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

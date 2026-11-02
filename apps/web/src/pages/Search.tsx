import { Music, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { absoluteApiUrl, api, type MediaBreakdownStat, type SearchFilters, type SearchResult } from '../api/client';
import { TextWithLinks } from '../components/MessageContent';
import { EntityPicker, type PickerOption } from '../components/search/EntityPicker';
import { Card, Skeleton } from '../components/ui/Card';
import { CopyButton } from '../components/ui/CopyButton';
import { Highlight } from '../components/ui/Highlight';
import { MediaPlaceholder, useMediaError } from '../components/ui/MediaPlaceholder';
import { useUrlTextFilter } from '../hooks/useUrlTextFilter';
import { searchTerms } from '../lib/highlight';
import { humanizeMixedSnippet, resolveMediaPreviewKind, searchHitClipboardText } from '../lib/messageMedia';
import { PERIOD_LABELS, readSearchFilters } from '../lib/searchLinks';
import { displayNameOrUnknown, formatDateTime, formatNumber } from '../lib/utils';
import { useAppStore } from '../store/appStore';

const PAGE_SIZE = 50;
const MY_SENDER = 'me';
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FIELD_CLASS = 'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:[color-scheme:dark]';
const LABEL_CLASS = 'block min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400';

function loadChatOptions(query: string): Promise<PickerOption[]> {
  return api.chats(8, 0, undefined, undefined, query).then((result) => result.data.map((chat) => ({
    value: chat.jid,
    label: chat.name,
    hint: chat.kind === 'group' ? 'Group' : undefined,
  })));
}

async function loadSenderOptions(query: string): Promise<PickerOption[]> {
  const result = await api.people(8, 0, { q: query });
  const people = result.data.map((person) => ({ value: person.jid, label: person.name }));
  return 'me'.startsWith(query.toLowerCase()) ? [{ value: MY_SENDER, label: 'Me' }, ...people] : people;
}

function chatName(jid: string): Promise<string | undefined> {
  return api.chats(1, 0, undefined, jid).then((result) => result.data[0]?.name);
}

function personName(jid: string): Promise<string | undefined> {
  if (jid === MY_SENDER) return Promise.resolve('Me');
  return api.people(1, 0, { jid }).then((result) => result.data[0]?.name);
}

/** A filter's display name. The URL only carries its JID, so a deep link has to look it up. */
function useResolvedName(jid: string | undefined, resolve: (jid: string) => Promise<string | undefined>): string | undefined {
  const [resolved, setResolved] = useState<{ jid: string; name: string | undefined } | null>(null);

  useEffect(() => {
    if (!jid) return;
    let active = true;
    resolve(jid)
      .then((name) => {
        if (active) setResolved({ jid, name });
      })
      .catch((err: Error) => console.error('Failed to resolve filter name:', err));
    return () => {
      active = false;
    };
  }, [jid, resolve]);

  return resolved && resolved.jid === jid ? resolved.name : undefined;
}

function SearchHitBody({ result, terms }: { result: SearchResult; terms: string[] }) {
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
            <TextWithLinks text={snippetDisplay} terms={terms} />
          </p>
        ) : fileUrl ? null : (
          <p className="text-sm text-slate-500 dark:text-slate-400">[No text]</p>
        )}
        {fileUrl && kind === 'audio' ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/80" onClick={(e) => e.stopPropagation()}>
            <Music className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-400" aria-hidden />
            <audio src={fileUrl} className="min-w-0 flex-1" controls preload="metadata" />
          </div>
        ) : null}
        {fileUrl && kind === 'other' ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex text-sm font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            Open attachment
          </a>
        ) : null}
      </div>
    </div>
  );
}

interface LoadedResults {
  /** The request these answer. Anything else on screen would be the previous search's. */
  key: string;
  results: SearchResult[];
  total: number;
}

export function Search() {
  const navigate = useNavigate();
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [searchParams, setSearchParams] = useSearchParams();
  const { value: query, setValue: setQuery, applied: appliedQuery, pending } = useUrlTextFilter();

  const filters = useMemo(() => readSearchFilters(searchParams), [searchParams]);
  const request = useMemo<SearchFilters>(() => ({ ...filters, q: appliedQuery || undefined }), [appliedQuery, filters]);
  const requestKey = JSON.stringify(request);
  const hasFilters = Object.keys(filters).length > 0;
  const canSearch = hasFilters || appliedQuery.length >= 2;
  const willSearch = hasFilters || query.trim().length >= 2;
  const terms = useMemo(() => searchTerms(appliedQuery), [appliedQuery]);

  const [loaded, setLoaded] = useState<LoadedResults | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaTypes, setMediaTypes] = useState<MediaBreakdownStat[]>([]);

  const chatLabel = useResolvedName(filters.chat, chatName);
  const senderLabel = useResolvedName(filters.sender, personName);
  const contactLabel = useResolvedName(filters.contact, personName);

  useEffect(() => {
    if (!canSearch) return;
    let active = true;
    api.search(request, PAGE_SIZE)
      .then((page) => {
        if (!active) return;
        setError(null);
        setLoaded({ key: JSON.stringify(request), results: page.data, total: page.pagination.total });
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [canSearch, dataVersion, request]);

  useEffect(() => {
    let active = true;
    api.mediaBreakdown('all')
      .then((breakdown) => {
        if (active) setMediaTypes(breakdown);
      })
      .catch((err: Error) => console.error('Failed to load media types:', err));
    return () => {
      active = false;
    };
  }, [dataVersion]);

  const current = loaded?.key === requestKey && !pending ? loaded : null;

  function loadMore() {
    if (!current || loadingMore) return;
    const key = current.key;
    setLoadingMore(true);
    api.search(request, PAGE_SIZE, current.results.length)
      .then((page) => {
        setLoaded((previous) => {
          // The search moved on while this page was in flight.
          if (previous?.key !== key) return previous;
          const seen = new Set(previous.results.map((result) => result.id));
          return {
            key,
            total: page.pagination.total,
            results: [...previous.results, ...page.data.filter((result) => !seen.has(result.id))],
          };
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingMore(false));
  }

  function setFilters(changes: Partial<Record<keyof SearchFilters, string | undefined>>) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  function clearFilters() {
    setSearchParams(appliedQuery ? { q: appliedQuery } : {});
  }

  const knownMediaTypes = mediaTypes.map((item) => item.mediaType);
  const customMediaType = filters.mediaType && filters.mediaType !== 'any' && !knownMediaTypes.includes(filters.mediaType)
    ? filters.mediaType
    : null;

  return (
    <main className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Search</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Search message text, chat names, and sender names, or narrow by chat, sender, date and media. Queries run against the local SQLite archive.</p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search messages..."
          aria-label="Search messages"
          className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-lg shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
        />
      </div>

      <Card className="space-y-3 p-4 dark:border-slate-800 dark:bg-slate-900">
        {filters.contact ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
            <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">
              Everything with <strong>{contactLabel ?? filters.contact}</strong>
              <span className="text-slate-500 dark:text-slate-400"> — their messages and your replies</span>
            </span>
            <Link
              to={`/contacts/${encodeURIComponent(filters.contact)}`}
              className="shrink-0 font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-500"
            >
              Open profile
            </Link>
            <button
              type="button"
              onClick={() => setFilters({ contact: undefined })}
              aria-label="Clear contact filter"
              className="ml-auto shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <EntityPicker
            label="Chat"
            placeholder="Any chat"
            value={filters.chat}
            valueLabel={chatLabel}
            onChange={(chat) => setFilters({ chat })}
            loadOptions={loadChatOptions}
          />
          <EntityPicker
            label="Sender"
            placeholder="Anyone"
            value={filters.sender}
            valueLabel={senderLabel}
            onChange={(sender) => setFilters({ sender })}
            loadOptions={loadSenderOptions}
          />
          <label className={LABEL_CLASS}>
            Media
            <select
              value={filters.mediaType ?? ''}
              onChange={(event) => setFilters({ mediaType: event.target.value })}
              className={FIELD_CLASS}
            >
              <option value="">All messages</option>
              <option value="any">Any media</option>
              {[...knownMediaTypes, ...(customMediaType ? [customMediaType] : [])].map((mediaType) => (
                <option key={mediaType} value={mediaType} className="capitalize">{mediaType}</option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Period
            <select
              value={filters.period ?? ''}
              // A rolling window and a fixed range would fight; the latest choice wins.
              onChange={(event) => setFilters({ period: event.target.value, from: undefined, to: undefined })}
              className={FIELD_CLASS}
            >
              <option value="">Any time</option>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            From
            <input
              type="date"
              value={filters.from ?? ''}
              max={filters.to}
              onChange={(event) => setFilters({ from: event.target.value, period: undefined })}
              className={FIELD_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            To
            <input
              type="date"
              value={filters.to ?? ''}
              min={filters.from}
              onChange={(event) => setFilters({ to: event.target.value, period: undefined })}
              className={FIELD_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Weekday
            <select value={filters.weekday ?? ''} onChange={(event) => setFilters({ weekday: event.target.value })} className={FIELD_CLASS}>
              <option value="">Any day</option>
              {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Hour
            <select value={filters.hour ?? ''} onChange={(event) => setFilters({ hour: event.target.value })} className={FIELD_CLASS}>
              <option value="">Any hour</option>
              {HOURS.map((hour) => <option key={hour} value={hour}>{hour}:00</option>)}
            </select>
          </label>
        </div>

        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-500"
          >
            Clear filters
          </button>
        ) : null}
      </Card>

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <Card className="min-h-72 dark:border-slate-800 dark:bg-slate-900">
        {!willSearch ? (
          <div className="flex h-56 items-center justify-center text-slate-500">Type at least two characters, or choose a filter.</div>
        ) : !current && error ? (
          <div className="flex h-56 items-center justify-center text-slate-500">This search could not be run.</div>
        ) : !current ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : current.results.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-slate-500">
            {appliedQuery ? <>No results for “{appliedQuery}”{hasFilters ? ' with these filters' : ''}.</> : 'No messages match these filters.'}
          </div>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
              {formatNumber(current.total)} {current.total === 1 ? 'message' : 'messages'}
              {current.results.length < current.total ? ` · showing the newest ${formatNumber(current.results.length)}` : ''}
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {current.results.map((result) => (
                <article
                  key={result.id}
                  onClick={() => navigate(`/chats?contact=${encodeURIComponent(result.chatJid)}&msg=${result.id}`)}
                  className="group relative -mx-4 rounded-2xl p-4 transition-all duration-200 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-950 transition-colors group-hover:text-brand-600 dark:text-slate-50 dark:group-hover:text-brand-400">
                        <Highlight text={result.chatName} terms={terms} />
                      </h3>
                      <p className="text-sm text-slate-500">
                        {result.fromMe ? 'Me' : <Highlight text={displayNameOrUnknown(result.senderName, result.senderJid)} terms={terms} />} · {formatDateTime(result.sentAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2" onClick={(e) => e.stopPropagation()}>
                      <CopyButton text={searchHitClipboardText(result.snippet, result.text, result.mediaType)} />
                      {result.mediaType ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{result.mediaType}</span> : null}
                    </div>
                  </div>
                  <SearchHitBody result={result} terms={terms} />
                </article>
              ))}
            </div>
            {current.results.length < current.total ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {loadingMore ? 'Loading…' : `Load ${formatNumber(Math.min(PAGE_SIZE, current.total - current.results.length))} more`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </main>
  );
}

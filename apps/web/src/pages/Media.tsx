import { format } from 'date-fns';
import { Globe, Heart, Link2, Music, Play, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  absoluteApiUrl,
  api,
  type LinkIntelligence,
  type MediaItem,
} from '../api/client';
import { Card, CardTitle, Skeleton } from '../components/ui/Card';
import { MediaPlaceholder, useMediaError } from '../components/ui/MediaPlaceholder';
import { formatBytes, formatDateTime, formatNumber, cn } from '../lib/utils';
import {
  friendlyMediaLabel,
  isLikelyOpaqueMediaHandle,
  resolveMediaPreviewKind,
  type MediaPreviewKind as PreviewKind,
} from '../lib/messageMedia';
import { useAppStore } from '../store/appStore';

const PAGE_SIZE = 60;

type MediaTab = 'grid' | 'intelligence';

function mediaAltLabel(text: string | null | undefined, chatName: string, mediaType: string): string {
  const t = text?.trim();
  if (t && !isLikelyOpaqueMediaHandle(t)) return t;
  return `${friendlyMediaLabel(mediaType)} · ${chatName}`;
}

function getPreviewKind(item: MediaItem): PreviewKind {
  return resolveMediaPreviewKind(item.mediaType, item.mediaPath) ?? 'other';
}

/* ─── Category colors & labels ─── */

const CATEGORY_COLORS: Record<string, string> = {
  video: '#ef4444',
  social: '#3b82f6',
  news: '#f59e0b',
  shopping: '#10b981',
  music: '#8b5cf6',
  dev: '#6366f1',
  reference: '#64748b',
  other: '#94a3b8',
};

const CATEGORY_LABELS: Record<string, string> = {
  video: 'Video',
  social: 'Social',
  news: 'News',
  shopping: 'Shopping',
  music: 'Music',
  dev: 'Developer',
  reference: 'Reference',
  other: 'Other',
};

/* ─── Main component ─── */

export function Media() {
  const [tab, setTab] = useState<MediaTab>('grid');

  return (
    <main className="space-y-6 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Media & Links</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Browse media files and discover link-sharing intelligence across your conversations.
          </p>
        </div>
        <div role="tablist" aria-label="Media view" className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([
            { id: 'grid' as const, label: 'Media Grid' },
            { id: 'intelligence' as const, label: 'Link Intelligence' },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'grid' ? <MediaGrid /> : <LinkIntelligencePanel />}
    </main>
  );
}

/* ─────────────────────────────────────────────
   Tab 1: Media Grid (original functionality)
   ───────────────────────────────────────────── */

function MediaGrid() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback((nextOffset: number) => {
    if (nextOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    api.media(PAGE_SIZE, nextOffset)
      .then((result) => {
        setItems((current) => (nextOffset === 0 ? result.data : [...current, ...result.data]));
        setOffset(nextOffset + result.data.length);
        setTotal(result.pagination.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, []);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && !loadingMore && offset < total) {
        loadPage(offset);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadPage, loading, loadingMore, offset, total]);

  return (
    <>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      {loading ? (
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="h-48" />)}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">No media files found.</Card>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          {items.map((item) => (
            <MediaGridCard key={item.id} item={item} onSelect={setActiveItem} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-8 text-center text-sm text-slate-500">
        {loadingMore ? 'Loading more media...' : offset < total ? 'Scroll for more' : items.length ? 'End of media' : null}
      </div>

      {activeItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-8" role="dialog" aria-modal="true">
          <button type="button" onClick={() => setActiveItem(null)} className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close media preview">
            <X className="h-5 w-5" />
          </button>
          <div className="max-h-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
            <MediaPreview item={activeItem} />
            <div className="p-5">
              <h3 className="font-semibold text-slate-950 dark:text-slate-50">{activeItem.chatName}</h3>
              <p className="text-sm text-slate-500">{activeItem.mediaPath}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MediaGridCard({ item, onSelect }: { item: MediaItem; onSelect: (item: MediaItem) => void }) {
  const fileUrl = absoluteApiUrl(item.fileUrl);
  const previewKind = getPreviewKind(item);
  const { failed, onError } = useMediaError();

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition [content-visibility:auto] hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      aria-label={`Open ${previewKind === 'other' ? item.mediaType : previewKind} from ${item.chatName}`}
    >
      <div className="relative flex h-40 items-center justify-center bg-slate-100 dark:bg-slate-800">
        {failed ? (
          <MediaPlaceholder className="h-full w-full" />
        ) : previewKind === 'image' ? (
          <img src={fileUrl} alt={mediaAltLabel(item.text, item.chatName, item.mediaType)} className="h-full w-full object-cover" loading="lazy" onError={onError} />
        ) : previewKind === 'video' ? (
          <>
            <video src={fileUrl} className="h-full w-full object-cover" preload="metadata" muted playsInline onError={onError} />
            <span className="absolute rounded-full bg-slate-950/75 p-3 text-white">
              <Play className="h-5 w-5 fill-current" />
            </span>
          </>
        ) : previewKind === 'audio' ? (
          <div className="flex flex-col items-center gap-3 text-slate-700 dark:text-slate-200">
            <span className="rounded-full bg-slate-900 p-4 text-white dark:bg-slate-700">
              <Music className="h-6 w-6" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide">Play audio</span>
          </div>
        ) : (
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase text-white">{item.mediaType}</span>
        )}
      </div>
      <div className="space-y-1 p-3 text-sm">
        <p className="truncate font-medium text-slate-950 dark:text-slate-50">{item.chatName}</p>
        <p className="text-xs text-slate-500">{formatBytes(item.mediaSize)} · {formatDateTime(item.sentAt)}</p>
      </div>
    </button>
  );
}

function MediaPreview({ item }: { item: MediaItem }) {
  const fileUrl = absoluteApiUrl(item.fileUrl);
  const previewKind = getPreviewKind(item);
  const { failed, onError } = useMediaError();

  if (failed) {
    return (
      <MediaPlaceholder
        className="flex h-80 w-[640px] max-w-[calc(100vw-4rem)]"
        message="File not accessible — check that the media directory is readable and that Full Disk Access has been granted."
      />
    );
  }

  if (previewKind === 'image') {
    return <img src={fileUrl} alt={mediaAltLabel(item.text, item.chatName, item.mediaType)} className="max-h-[75vh] w-full object-contain" onError={onError} />;
  }

  if (previewKind === 'video') {
    return <video src={fileUrl} className="max-h-[75vh] w-full bg-black" controls autoPlay playsInline onError={onError} />;
  }

  if (previewKind === 'audio') {
    return (
      <div className="flex w-[640px] max-w-[calc(100vw-4rem)] flex-col items-center gap-6 bg-slate-100 p-10 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <Music className="h-12 w-12" />
        <audio src={fileUrl} className="w-full" controls autoPlay preload="metadata" />
      </div>
    );
  }

  return (
    <div className="flex h-80 w-[640px] max-w-[calc(100vw-4rem)] items-center justify-center bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {item.mediaType} file
    </div>
  );
}

/* ──────────────────────────────────────────────────
   Tab 2: Link & Media Intelligence
   ────────────────────────────────────────────────── */

function LinkIntelligencePanel() {
  const period = useAppStore((state) => state.period);
  const [data, setData] = useState<LinkIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api.linkIntelligence(period, 15)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [period]);

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>;
  }

  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="dark:border-slate-800 dark:bg-slate-900">
            <Skeleton className="h-64" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview stat pills */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 dark:bg-brand-600/20">
          <Link2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">{formatNumber(data.totalLinks)} links shared</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 dark:bg-slate-800">
          <Globe className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatNumber(data.uniqueDomains)} unique domains</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Domain Leaderboard */}
        <DomainLeaderboard data={data.domainLeaderboard} />

        {/* Content Categories */}
        <ContentCategories data={data.linkCategories} />

        {/* Media Timeline Density */}
        <MediaTimeline data={data.mediaTimeline} />

        {/* Sharing Asymmetry */}
        <SharingAsymmetry data={data.sharingAsymmetry} />

        {/* First Shared */}
        <FirstShared data={data.firstShared} />
      </div>
    </div>
  );
}

/* ─── Domain Leaderboard ─── */

function DomainLeaderboard({ data }: { data: LinkIntelligence['domainLeaderboard'] }) {
  if (data.length === 0) {
    return (
      <Card className="dark:border-slate-800 dark:bg-slate-900">
        <CardTitle className="dark:text-slate-50">Link Domain Leaderboard</CardTitle>
        <p className="mt-4 text-sm text-slate-500">No links found in messages.</p>
      </Card>
    );
  }

  const chartData = data.slice(0, 10).map((d) => ({
    domain: d.domain.length > 18 ? d.domain.slice(0, 16) + '...' : d.domain,
    fullDomain: d.domain,
    count: d.count,
    fill: CATEGORY_COLORS[d.category] ?? CATEGORY_COLORS.other,
  }));

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Link Domain Leaderboard</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Most shared domains extracted from message text</p>
      <div className="mt-4 h-72 overflow-x-auto">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="domain" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
            <Tooltip
              formatter={(value) => [formatNumber(Number(value)), 'Links']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDomain ?? ''}
            />
            {chartData.map((entry, idx) => (
              <Bar key={idx} dataKey="count" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                {chartData.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Bar>
            )).slice(0, 1)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/* ─── Content Categories (Pie Chart) ─── */

function ContentCategories({ data }: { data: LinkIntelligence['linkCategories'] }) {
  if (data.length === 0) return null;

  const pieData = data.map((cat) => ({
    name: CATEGORY_LABELS[cat.category] ?? cat.category,
    value: cat.count,
    fill: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS.other,
    topDomain: cat.topDomain,
  }));

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Content Categories</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Links auto-tagged by domain type</p>
      <div className="mt-4 flex items-center gap-6">
        <div className="h-52 w-52 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                dataKey="value"
                paddingAngle={2}
                isAnimationActive={false}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [formatNumber(Number(value)), 'Links']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {data.map((cat) => (
            <div key={cat.category} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS.other }}
              />
              <span className="font-medium dark:text-slate-100">{CATEGORY_LABELS[cat.category] ?? cat.category}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{formatNumber(cat.count)}</span>
              <span className="ml-auto truncate text-xs text-slate-400 max-w-[120px]">{cat.topDomain}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ─── Media Timeline (density strip) ─── */

function MediaTimeline({ data }: { data: LinkIntelligence['mediaTimeline'] }) {
  const bucketedData = useMemo(() => {
    if (data.length === 0) return [];
    if (data.length <= 60) return data;

    const bucketSize = Math.ceil(data.length / 60);
    const buckets: Array<{ date: string; images: number; videos: number; audio: number; links: number }> = [];
    for (let i = 0; i < data.length; i += bucketSize) {
      const slice = data.slice(i, i + bucketSize);
      buckets.push({
        date: slice[0].date,
        images: slice.reduce((s, p) => s + p.images, 0),
        videos: slice.reduce((s, p) => s + p.videos, 0),
        audio: slice.reduce((s, p) => s + p.audio, 0),
        links: slice.reduce((s, p) => s + p.links, 0),
      });
    }
    return buckets;
  }, [data]);

  if (bucketedData.length === 0) {
    return (
      <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
        <CardTitle className="dark:text-slate-50">Media & Link Timeline</CardTitle>
        <p className="mt-4 text-sm text-slate-500">No media or link activity found.</p>
      </Card>
    );
  }

  const maxTotal = Math.max(...bucketedData.map((d) => d.images + d.videos + d.audio + d.links), 1);

  return (
    <Card className="col-span-2 dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Media & Link Timeline</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Visual density showing photos, videos, audio, and links over time — spot trips, events, and sharing bursts</p>
      <div className="mt-4 space-y-3">
        <div className="flex h-24 items-end gap-px">
          {bucketedData.map((d, i) => {
            const total = d.images + d.videos + d.audio + d.links;
            const heightPct = Math.max((total / maxTotal) * 100, 2);
            const imgPct = total > 0 ? (d.images / total) * 100 : 0;
            const vidPct = total > 0 ? (d.videos / total) * 100 : 0;
            const audPct = total > 0 ? (d.audio / total) * 100 : 0;

            return (
              <div
                key={i}
                className="group relative flex-1 cursor-default"
                style={{ height: '100%' }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden rounded-t"
                  style={{ height: `${heightPct}%` }}
                >
                  {imgPct > 0 && <div className="flex-none bg-blue-500" style={{ height: `${imgPct}%` }} />}
                  {vidPct > 0 && <div className="flex-none bg-red-500" style={{ height: `${vidPct}%` }} />}
                  {audPct > 0 && <div className="flex-none bg-purple-500" style={{ height: `${audPct}%` }} />}
                  <div className="flex-1 bg-emerald-500" />
                </div>
                <div className="pointer-events-none absolute -top-16 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow-lg group-hover:block dark:bg-slate-700">
                  <p className="font-semibold">{d.date}</p>
                  <p>{d.images} img · {d.videos} vid · {d.audio} aud · {d.links} link</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
          <span>{bucketedData[0].date}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Photos</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Videos</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-purple-500" /> Audio</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Links</span>
          </div>
          <span>{bucketedData[bucketedData.length - 1].date}</span>
        </div>
      </div>
    </Card>
  );
}

/* ─── Sharing Asymmetry ─── */

function SharingAsymmetry({ data }: { data: LinkIntelligence['sharingAsymmetry'] }) {
  if (data.length === 0) return null;

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Sharing Asymmetry</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">"Shared with you" vs "You shared" — media and link balance per contact</p>
      <div className="mt-4 space-y-3 max-h-80 overflow-y-auto">
        {data.map((item) => {
          const totalSent = item.mediaSent + item.linksSent;
          const totalReceived = item.mediaReceived + item.linksReceived;
          const total = totalSent + totalReceived;
          const sentPct = total > 0 ? Math.round((totalSent / total) * 100) : 50;
          const receivedPct = 100 - sentPct;

          return (
            <div key={item.jid} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium dark:text-slate-100 truncate mr-2">{item.name}</span>
                <span className="text-xs text-slate-500 shrink-0">
                  You {totalSent} · Them {totalReceived}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="bg-brand-500 transition-all duration-500"
                  style={{ width: `${sentPct}%` }}
                  title={`You shared: ${sentPct}%`}
                />
                <div
                  className="bg-violet-400 dark:bg-violet-500 transition-all duration-500"
                  style={{ width: `${receivedPct}%` }}
                  title={`They shared: ${receivedPct}%`}
                />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span>{item.mediaSent} media sent · {item.linksSent} links sent</span>
                <span className="ml-auto">{item.mediaReceived} media recv · {item.linksReceived} links recv</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 pt-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-brand-500" /> You shared</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-violet-400 dark:bg-violet-500" /> They shared</span>
      </div>
    </Card>
  );
}

/* ─── First Shared (nostalgia) ─── */

function FirstShared({ data }: { data: LinkIntelligence['firstShared'] }) {
  if (data.length === 0) return null;

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-rose-500" />
        <CardTitle className="dark:text-slate-50">First Shared</CardTitle>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The very first message or media exchanged with each contact</p>
      <div className="mt-4 space-y-3 max-h-80 overflow-y-auto">
        {data.map((item) => (
          <div key={item.jid} className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium dark:text-slate-100 truncate mr-2">{item.name}</span>
              <span className="text-xs text-slate-400 shrink-0">
                {format(new Date(item.firstMessageDate), 'MMM d, yyyy')}
              </span>
            </div>
            {item.firstMessageText ? (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 italic">
                "{item.firstMessageText}"
              </p>
            ) : null}
            {item.firstMediaType && item.firstMediaDate ? (
              <p className="mt-1 text-[10px] text-slate-400">
                First {item.firstMediaType}: {format(new Date(item.firstMediaDate), 'MMM d, yyyy')}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

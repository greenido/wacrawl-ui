import { Music, Play, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { absoluteApiUrl, api, type MediaItem } from '../api/client';
import { Card, Skeleton } from '../components/ui/Card';
import { MediaPlaceholder, useMediaError } from '../components/ui/MediaPlaceholder';
import { formatBytes, formatDateTime } from '../lib/utils';
import { friendlyMediaLabel, isLikelyOpaqueMediaHandle, resolveMediaPreviewKind, type MediaPreviewKind as PreviewKind } from '../lib/messageMedia';

const PAGE_SIZE = 60;

function mediaAltLabel(text: string | null | undefined, chatName: string, mediaType: string): string {
  const t = text?.trim();
  if (t && !isLikelyOpaqueMediaHandle(t)) return t;
  return `${friendlyMediaLabel(mediaType)} · ${chatName}`;
}

function getPreviewKind(item: MediaItem): PreviewKind {
  return resolveMediaPreviewKind(item.mediaType, item.mediaPath) ?? 'other';
}

export function Media() {
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
    <main className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Media</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">A virtualized, incrementally loaded grid of indexed local media files.</p>
      </div>

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
    </main>
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

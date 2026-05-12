import { ExternalLink, Music } from 'lucide-react';
import { absoluteApiUrl } from '../api/client';
import { cn } from '../lib/utils';
import {
  friendlyMediaLabel,
  isLikelyOpaqueMediaHandle,
  resolveMediaPreviewKind,
  type MediaPreviewKind,
} from '../lib/messageMedia';

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/gi;

function splitUrlTail(url: string): { href: string; tail: string } {
  let href = url;
  let tail = '';
  while (href.length > 0 && /[.,);'"»\]\u201d]$/u.test(href)) {
    tail = href.slice(-1) + tail;
    href = href.slice(0, -1);
  }
  return { href, tail };
}

export function TextWithLinks({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_SPLIT_RE);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!/^https?:\/\//i.test(part)) {
          return part;
        }
        const { href, tail } = splitUrlTail(part);
        return (
          <span key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 underline decoration-brand-600/40 underline-offset-2 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              {href}
            </a>
            {tail}
          </span>
        );
      })}
    </span>
  );
}

function mediaFileUrl(mediaPath: string): string {
  return absoluteApiUrl(`/api/media/file?path=${encodeURIComponent(mediaPath)}`);
}

function InlineMedia({
  kind,
  fileUrl,
  alt,
}: {
  kind: MediaPreviewKind;
  fileUrl: string;
  alt: string;
}) {
  if (kind === 'image') {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-slate-200/80 dark:ring-slate-700">
        <img src={fileUrl} alt={alt} className="max-h-56 w-full object-cover sm:max-h-72" loading="lazy" />
      </a>
    );
  }
  if (kind === 'video') {
    return <video src={fileUrl} className="max-h-56 w-full rounded-xl bg-black object-contain sm:max-h-72" controls preload="metadata" playsInline />;
  }
  if (kind === 'audio') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-slate-100/90 px-3 py-2 dark:bg-slate-950/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white dark:bg-slate-700">
          <Music className="h-4 w-4" aria-hidden />
        </span>
        <audio src={fileUrl} className="min-w-0 flex-1" controls preload="metadata" />
      </div>
    );
  }
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
    >
      <ExternalLink className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      Open file
    </a>
  );
}

export interface MessageContentProps {
  text: string | null;
  mediaType: string | null;
  mediaPath: string | null;
  className?: string;
}

export function MessageContent({ text, mediaType, mediaPath, className }: MessageContentProps) {
  const trimmed = text?.trim() ?? '';
  const opaque = trimmed.length > 0 && isLikelyOpaqueMediaHandle(trimmed);
  const kind = resolveMediaPreviewKind(mediaType, mediaPath);
  const pathOk = Boolean(mediaPath?.trim());
  const fileUrl = pathOk ? mediaFileUrl(mediaPath!) : null;

  const dataImage = trimmed.startsWith('data:image/') ? trimmed : null;
  const plainUrl =
    !dataImage && /^https?:\/\/\S+$/i.test(trimmed) ? splitUrlTail(trimmed).href : null;

  const showCaption = trimmed.length > 0 && !opaque && !plainUrl && !dataImage;
  const alt = trimmed && !opaque ? trimmed : friendlyMediaLabel(mediaType);

  const fallbackLabel =
    friendlyMediaLabel(mediaType) ||
    (mediaPath ? 'Attachment' : opaque ? 'Media' : 'Message');

  return (
    <div className={cn('space-y-2 text-sm text-slate-800 dark:text-slate-100', className)}>
      {opaque ? <span className="sr-only">{trimmed}</span> : null}

      {dataImage ? (
        <img src={dataImage} alt="" className="max-h-56 w-full rounded-xl object-contain sm:max-h-72" />
      ) : null}

      {!dataImage && fileUrl && kind ? (
        <InlineMedia kind={kind} fileUrl={fileUrl} alt={alt} />
      ) : null}

      {plainUrl ? (
        <a
          href={plainUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 break-all rounded-lg bg-white/60 px-2 py-1 text-sm font-medium text-brand-700 ring-1 ring-brand-200/60 hover:bg-white dark:bg-slate-950/30 dark:text-brand-300 dark:ring-brand-800/50"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          {plainUrl}
        </a>
      ) : null}

      {showCaption ? (
        <p className="whitespace-pre-wrap">
          <TextWithLinks text={trimmed} />
        </p>
      ) : null}

      {!showCaption && !plainUrl && !dataImage && trimmed.length > 0 && !opaque ? (
        <p className="whitespace-pre-wrap">
          <TextWithLinks text={trimmed} />
        </p>
      ) : null}

      {!showCaption && !plainUrl && !dataImage && trimmed.length > 0 && opaque && !fileUrl ? (
        <p className="text-slate-600 dark:text-slate-300">{fallbackLabel}</p>
      ) : null}

      {!trimmed && !fileUrl && !dataImage ? (
        <p className="text-slate-500 dark:text-slate-400">{fallbackLabel}</p>
      ) : null}
    </div>
  );
}

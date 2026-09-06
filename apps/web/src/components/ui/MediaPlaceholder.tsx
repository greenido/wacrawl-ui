import { ImageOff } from 'lucide-react';
import { type SyntheticEvent, useCallback, useState } from 'react';
import { cn } from '../../lib/utils';

export function MediaPlaceholder({ className, message }: { className?: string; message?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
        className,
      )}
    >
      <ImageOff className="h-6 w-6" />
      <span className="max-w-[90%] text-center text-xs leading-tight">
        {message ?? 'Media unavailable'}
      </span>
    </div>
  );
}

/**
 * Hook: returns { failed, onError } for use on <img> / <video> elements.
 * When the element fires an error event, `failed` flips to true so the
 * caller can swap in a <MediaPlaceholder>.
 */
export function useMediaError() {
  const [failed, setFailed] = useState(false);
  const onError = useCallback((e: SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
    e.currentTarget.style.display = 'none';
    setFailed(true);
  }, []);
  return { failed, onError } as const;
}

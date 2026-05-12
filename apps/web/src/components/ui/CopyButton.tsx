import { Check, Copy } from 'lucide-react';
import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

interface CopyButtonProps {
  text: string;
  className?: string;
  /** Accessible name when idle */
  label?: string;
}

export function CopyButton({ text, className, label = 'Copy text' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  const handleClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const trimmed = text.trim();
      if (!trimmed) return;
      const ok = await writeClipboard(trimmed);
      if (!ok) return;
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), 2000);
    },
    [text],
  );

  const disabled = text.trim().length === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied to clipboard' : label}
      className={cn(
        'inline-flex shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/80 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-slate-700/80 dark:hover:text-slate-200',
        copied && 'text-brand-600 dark:text-brand-400',
        className,
      )}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}

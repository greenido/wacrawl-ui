import { Download } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';

export type ExportFormat = 'csv' | 'json';

interface ExportButtonsProps {
  /** What is being exported, for the accessible names: "search results". */
  subject: string;
  onExport: (format: ExportFormat) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

/** A CSV and a JSON button, each busy while its own export runs. */
export function ExportButtons({ subject, onExport, disabled, className }: ExportButtonsProps) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  async function run(format: ExportFormat) {
    setBusy(format);
    try {
      await onExport(format);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {(['csv', 'json'] as const).map((format) => (
        <button
          key={format}
          type="button"
          onClick={() => void run(format)}
          disabled={disabled || busy !== null}
          aria-label={`Export ${subject} as ${format.toUpperCase()}`}
          className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {busy === format ? 'Exporting…' : format.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

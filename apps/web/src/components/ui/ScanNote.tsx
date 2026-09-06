import type { ScanCoverage } from '../../api/client';
import { formatNumber } from '../../lib/utils';

interface ScanNoteProps {
  scan: ScanCoverage | null | undefined;
  /** What the report counted, e.g. "messages" or "replies". */
  unit?: string;
}

/**
 * Footnote for reports that cap how much of the archive they read.
 *
 * Without it the card presents "the last 30,000 messages" as if it were the
 * whole period the user selected. Renders nothing when the scan was complete,
 * so an untruncated archive stays uncluttered.
 */
export function ScanNote({ scan, unit = 'messages' }: ScanNoteProps) {
  if (!scan?.truncated) return null;

  return (
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
      Based on the most recent {formatNumber(scan.limit)} {unit} in this period.
    </p>
  );
}

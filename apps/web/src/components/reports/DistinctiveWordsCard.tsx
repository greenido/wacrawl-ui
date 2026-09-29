import type { DistinctiveTerm, DistinctiveWords } from '../../api/client';
import { formatNumber } from '../../lib/utils';
import { Card, CardTitle, Skeleton } from '../ui/Card';
import { ScanNote } from '../ui/ScanNote';

interface DistinctiveWordsCardProps {
  data: DistinctiveWords | null;
  loading: boolean;
  onSelectTerm: (term: string) => void;
}

function TermColumn({
  heading,
  terms,
  empty,
  onSelectTerm,
}: {
  heading: string;
  terms: DistinctiveTerm[];
  empty: string;
  onSelectTerm: (term: string) => void;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{heading}</h3>
      {terms.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {terms.map((term) => (
            <button
              key={term.text}
              type="button"
              onClick={() => onSelectTerm(term.text)}
              title={`You ${formatNumber(term.mine)}× · everyone else ${formatNumber(term.theirs)}×`}
              aria-label={`Search for ${term.text}`}
              className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 transition hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/40 dark:bg-brand-600/20 dark:text-brand-50 dark:hover:bg-brand-600/30"
            >
              {term.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Words that lean hard to one side of the conversation.
 *
 * The word cloud shows what gets said most; this shows who says it. Ranking is
 * done server-side by log-odds, so shared everyday words drop out on their own.
 */
export function DistinctiveWordsCard({ data, loading, onSelectTerm }: DistinctiveWordsCardProps) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardTitle className="dark:text-slate-50">Distinctive Words</CardTitle>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Not your most common words — the ones that mark a message as yours, or as theirs
      </p>
      {loading || !data ? <Skeleton className="mt-4 h-32 rounded-xl" /> : (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <TermColumn heading="Yours" terms={data.mine} empty="Nothing you say stands out from everyone else yet." onSelectTerm={onSelectTerm} />
          <TermColumn heading="Theirs" terms={data.theirs} empty="Nothing they say stands out from you yet." onSelectTerm={onSelectTerm} />
        </div>
      )}
      <ScanNote scan={data?.scan} />
    </Card>
  );
}

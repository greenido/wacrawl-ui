import { splitHighlights } from '../../lib/highlight';

/** Text with its matched terms marked. Message text only ever reaches the DOM as text nodes. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {splitHighlights(text, terms).map((part, index) => (
        part.match
          ? <mark key={index} className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">{part.text}</mark>
          : part.text
      ))}
    </>
  );
}

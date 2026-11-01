const WORD_RE = /[\p{L}\p{N}]+/gu;

/**
 * What a query searches for, split the way the API's FTS query splits it. A
 * query with no words in it (an emoji, say) is matched literally, as the API does.
 */
export function searchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return trimmed.match(WORD_RE)?.slice(0, 8) ?? [trimmed];
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Split text around the terms, as plain strings for React to render.
 *
 * FTS matches terms at the start of a word, so "art" should not light up inside
 * "start" in a hit that also says "art". The substring fallback covers hits the
 * LIKE path found mid-word, and a chat name matched while the snippet did not.
 */
export function splitHighlights(text: string, terms: string[]): HighlightPart[] {
  if (terms.length === 0 || !text) return [{ text, match: false }];

  const alternatives = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const wordStart = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})`, 'giu');
  const pattern = text.search(wordStart) >= 0 ? wordStart : new RegExp(alternatives, 'giu');

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const found of text.matchAll(pattern)) {
    if (found.index > cursor) parts.push({ text: text.slice(cursor, found.index), match: false });
    parts.push({ text: found[0], match: true });
    cursor = found.index + found[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEBOUNCE_MS = 250;

/**
 * A text box whose settled value lives in the URL.
 *
 * Returns what is in the box and what is in the URL. Pages fetch on the URL
 * value, which only moves once typing pauses, and can tell the two apart to know
 * a search is still pending.
 */
export function useUrlTextFilter(key = 'q') {
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = searchParams.get(key) ?? '';
  const [value, setValue] = useState(applied);
  const lastWritten = useRef(applied);

  // The URL changed under us (back button, a link): the box follows it.
  useEffect(() => {
    if (applied !== lastWritten.current) {
      lastWritten.current = applied;
      setValue(applied);
    }
  }, [applied]);

  useEffect(() => {
    if (value === lastWritten.current) return;
    const timeout = window.setTimeout(() => {
      lastWritten.current = value;
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (value.trim()) next.set(key, value);
        else next.delete(key);
        return next;
      }, { replace: true });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [key, setSearchParams, value]);

  return { value, setValue, applied: applied.trim(), pending: value !== applied };
}

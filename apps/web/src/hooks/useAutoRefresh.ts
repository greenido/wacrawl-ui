import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';

/**
 * Matches the API's stats cache window: come back sooner than this and a refetch
 * would be served from the same cached values anyway.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Refetches when the tab comes back after being hidden a while, so a dashboard
 * left open overnight is not still showing yesterday's numbers.
 *
 * Deliberately refetch-only: it never triggers an import. Spawning `wacrawl sync`
 * every time a tab regains focus would rewrite the archive behind the user's
 * back. Opening the app needs no special handling — pages fetch on mount, and
 * the API caches per archive fingerprint, so that first load is already current.
 */
export function useAutoRefresh(): void {
  const invalidateData = useAppStore((state) => state.invalidateData);
  const hiddenSince = useRef<number | null>(null);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        hiddenSince.current = Date.now();
        return;
      }

      const since = hiddenSince.current;
      hiddenSince.current = null;
      if (since !== null && Date.now() - since >= STALE_AFTER_MS) {
        invalidateData();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [invalidateData]);
}

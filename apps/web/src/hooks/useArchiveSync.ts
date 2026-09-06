import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, api } from '../api/client';
import { useAppStore } from '../store/appStore';

const POLL_INTERVAL_MS = 1200;

export interface ArchiveSyncController {
  /** False when the server disabled sync; the button then only refetches. */
  enabled: boolean;
  syncing: boolean;
  error: string | null;
  hint: string | null;
  lastImportAt: string | null;
  refresh: () => void;
  dismissError: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Drives the refresh button: asks the API to run `wacrawl sync`, follows the job
 * to completion, then marks every page's data stale.
 *
 * The import happens outside the request that starts it, so the only way to know
 * how it went is to poll. Kept in a hook rather than the store because the
 * polling loop is tied to the button's lifetime.
 */
export function useArchiveSync(): ArchiveSyncController {
  const invalidateData = useAppStore((state) => state.invalidateData);
  const [enabled, setEnabled] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [lastImportAt, setLastImportAt] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Poll until the job leaves `running`, then report the outcome. */
  const followJob = useCallback(async () => {
    try {
      while (mounted.current) {
        const status = await api.syncStatus();
        if (!mounted.current) return;

        setEnabled(status.enabled);
        setLastImportAt(status.archive.lastImportAt);

        if (status.job.state !== 'running') {
          setError(status.job.error);
          setHint(status.job.hint);
          setSyncing(false);
          // Refetch even after a failure: an aborted import can still have
          // written part of the archive, and the API caches per file
          // fingerprint, so a genuine no-op costs nothing.
          invalidateData();
          return;
        }

        await delay(POLL_INTERVAL_MS);
      }
    } catch (err) {
      if (!mounted.current) return;
      setError((err as Error).message);
      setSyncing(false);
    }
  }, [invalidateData]);

  useEffect(() => {
    void (async () => {
      try {
        const status = await api.syncStatus();
        if (!mounted.current) return;

        setEnabled(status.enabled);
        setLastImportAt(status.archive.lastImportAt);

        // An import started before this page load — or by another tab — is still
        // ours to report on.
        if (status.job.state === 'running') {
          setSyncing(true);
          void followJob();
        }
      } catch {
        // The stamp is cosmetic, and the pages themselves report API trouble.
      }
    })();
  }, [followJob]);

  const refresh = useCallback(() => {
    if (syncing) return;

    setError(null);
    setHint(null);

    if (!enabled) {
      invalidateData();
      return;
    }

    setSyncing(true);
    void (async () => {
      try {
        await api.startSync();
      } catch (err) {
        // 409 means another tab got there first, which is still a sync worth
        // following rather than an error to show.
        if (!(err instanceof ApiClientError && err.status === 409)) {
          if (!mounted.current) return;
          setError((err as Error).message);
          setSyncing(false);
          return;
        }
      }

      await followJob();
    })();
  }, [enabled, followJob, invalidateData, syncing]);

  const dismissError = useCallback(() => {
    setError(null);
    setHint(null);
  }, []);

  return { enabled, syncing, error, hint, lastImportAt, refresh, dismissError };
}

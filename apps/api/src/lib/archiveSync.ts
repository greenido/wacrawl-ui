import { spawn } from 'node:child_process';

import { closeDb, getDb } from '../db.js';
import { clearStatsCache } from './statsCache.js';

/**
 * Refreshing the archive means shelling out to the `wacrawl` CLI — the dashboard
 * itself only ever opens the SQLite file readonly, so it cannot import new
 * messages on its own.
 *
 * An import can run for minutes on a large account, far longer than a request
 * should be held open, so a POST starts the job and the client polls for the
 * outcome. Only one import may be in flight: two `wacrawl sync` processes
 * writing the same archive is a corruption risk, and the CLI is the only thing
 * that knows how to write it safely.
 */
export type SyncState = 'idle' | 'running' | 'succeeded' | 'failed';

export interface SyncJobStatus {
  state: SyncState;
  startedAt: string | null;
  finishedAt: string | null;
  /** CLI failure output, already trimmed to something displayable. */
  error: string | null;
  /** Operator-facing next step for failures we recognise. */
  hint: string | null;
}

export interface ArchiveSyncInfo {
  /** ISO timestamp of the last successful `wacrawl sync`, as recorded by the CLI. */
  lastImportAt: string | null;
  sourcePath: string | null;
}

/** Import can be genuinely slow on a first run; give up rather than leak a process. */
const SYNC_TIMEOUT_MS = 10 * 60 * 1000;

/** Enough of the CLI's output to diagnose a failure, without unbounded buffering. */
const MAX_OUTPUT_BYTES = 8 * 1024;

const MULTI_IDENTITY_PATTERN = /multiple whatsapp account identities/i;

const MULTI_IDENTITY_HINT =
  'The WhatsApp source holds more than one account identity, so wacrawl refuses to import it automatically. '
  + 'Run `wacrawl sync --adopt-source` in a terminal to bind this archive to one identity and merge. '
  + 'The dashboard will not do that for you: it rewrites which account owns the archive.';

const MISSING_BINARY_HINT =
  'Install the wacrawl CLI and make sure it is on PATH, or point WACRAWL_BIN at the executable.';

const idleJob: SyncJobStatus = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  hint: null,
};

let job: SyncJobStatus = idleJob;
let inFlight: Promise<void> | null = null;

export function syncEnabled(): boolean {
  return process.env.WACRAWL_DISABLE_SYNC !== '1';
}

export function syncJobStatus(): SyncJobStatus {
  return { ...job };
}

/** Test seam: drop job state between cases so each starts from idle. */
export function resetSyncJob(): void {
  job = idleJob;
  inFlight = null;
}

/**
 * Read the CLI's own bookkeeping table. Older archives predate `sync_state` and
 * a misconfigured path means no archive at all, so every failure degrades to
 * "unknown" rather than breaking the status endpoint.
 */
export function readArchiveSyncInfo(): ArchiveSyncInfo {
  try {
    const db = getDb();
    const present = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_state'")
      .get();
    if (!present) {
      return { lastImportAt: null, sourcePath: null };
    }

    const rows = db.prepare('SELECT key, value FROM sync_state').all() as Array<{ key: string; value: string }>;
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    return {
      lastImportAt: byKey.get('last_import_at') ?? null,
      sourcePath: byKey.get('source_path') ?? null,
    };
  } catch {
    return { lastImportAt: null, sourcePath: null };
  }
}

/**
 * Start an import unless one is already running.
 *
 * `started: false` means the caller lost the race and should poll the returned
 * job rather than treating it as an error.
 */
export function startSync(dbPath: string): { started: boolean; job: SyncJobStatus } {
  if (inFlight) {
    return { started: false, job: syncJobStatus() };
  }

  job = { state: 'running', startedAt: new Date().toISOString(), finishedAt: null, error: null, hint: null };

  inFlight = runWacrawlSync(dbPath).then((outcome) => {
    if (outcome.ok) {
      // The import rewrote the file underneath a readonly handle, and every
      // cached stat was computed from the old contents.
      closeDb();
      clearStatsCache();
    }

    job = {
      state: outcome.ok ? 'succeeded' : 'failed',
      startedAt: job.startedAt,
      finishedAt: new Date().toISOString(),
      error: outcome.ok ? null : outcome.error,
      hint: outcome.ok ? null : outcome.hint,
    };
  }).finally(() => {
    inFlight = null;
  });

  return { started: true, job: syncJobStatus() };
}

interface SyncOutcome {
  ok: boolean;
  error: string | null;
  hint: string | null;
}

/**
 * Spawned without a shell and with a fixed argument list, so the configured
 * archive path cannot turn into extra commands.
 */
function runWacrawlSync(dbPath: string): Promise<SyncOutcome> {
  return new Promise((resolve) => {
    const bin = process.env.WACRAWL_BIN ?? 'wacrawl';
    let output = '';
    let settled = false;

    function settle(outcome: SyncOutcome) {
      if (settled) return;
      settled = true;
      resolve(outcome);
    }

    const child = spawn(bin, ['--db', dbPath, 'sync'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SYNC_TIMEOUT_MS,
    });

    function collect(chunk: Buffer) {
      if (output.length >= MAX_OUTPUT_BYTES) return;
      output += chunk.toString('utf8');
    }

    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    child.on('error', (error: NodeJS.ErrnoException) => {
      settle(error.code === 'ENOENT'
        ? { ok: false, error: `Cannot run "${bin}": the wacrawl CLI was not found.`, hint: MISSING_BINARY_HINT }
        : { ok: false, error: `Cannot run "${bin}": ${error.message}`, hint: null });
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        settle({ ok: true, error: null, hint: null });
        return;
      }

      // node's `timeout` option kills the child rather than emitting an error.
      if (signal) {
        settle({
          ok: false,
          error: `wacrawl sync was terminated by ${signal} after ${Math.round(SYNC_TIMEOUT_MS / 60_000)} minutes.`,
          hint: 'Run `wacrawl sync` in a terminal to see how far it gets.',
        });
        return;
      }

      settle({
        ok: false,
        error: summarize(output) || `wacrawl sync exited with code ${code}.`,
        hint: MULTI_IDENTITY_PATTERN.test(output) ? MULTI_IDENTITY_HINT : null,
      });
    });
  });
}

/**
 * The CLI reports progress on the way to a failure, so the last few non-empty
 * lines carry the reason while the earlier ones are noise.
 */
function summarize(output: string): string {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(' — ').slice(0, 500);
}

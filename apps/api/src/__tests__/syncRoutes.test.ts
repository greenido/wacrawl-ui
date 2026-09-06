import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetSyncJob, type SyncJobStatus, type SyncState } from '../lib/archiveSync.js';
import { createTestDb } from './testDb.js';

let server: Server;
let baseUrl: string;
let tmpDir: string;
let plainDbPath: string;
let syncedDbPath: string;
let argsLogPath: string;

const bins: Record<'ok' | 'failing' | 'slow', string> = {
  ok: '',
  failing: '',
  slow: '',
};

/** Reserve a free port so the app's own localhost Host allowlist matches. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

function writeFakeBin(name: string, body: string): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

function startSyncRequest(headers: Record<string, string> = { 'X-Wacrawl-Request': '1' }) {
  return fetch(`${baseUrl}/api/sync`, { method: 'POST', headers });
}

async function readStatus(): Promise<{ enabled: boolean; job: SyncJobStatus; archive: { lastImportAt: string | null; sourcePath: string | null } }> {
  const response = await fetch(`${baseUrl}/api/sync/status`);
  return response.json();
}

/** The import runs detached from the request, so the outcome only shows up on a later poll. */
async function waitForJobState(expected: SyncState, timeoutMs = 10_000): Promise<SyncJobStatus> {
  const deadline = Date.now() + timeoutMs;
  let last: SyncJobStatus | undefined;
  while (Date.now() < deadline) {
    last = (await readStatus()).job;
    if (last.state === expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Job never reached "${expected}"; last state was "${last?.state}" (${last?.error ?? 'no error'})`);
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-sync-'));

  plainDbPath = path.join(tmpDir, 'archive.db');
  createTestDb(plainDbPath).close();

  // A second archive carrying the CLI's own bookkeeping table, so the status
  // endpoint can be checked both with and without it.
  syncedDbPath = path.join(tmpDir, 'synced.db');
  const syncedDb = createTestDb(syncedDbPath);
  syncedDb.exec(`
    CREATE TABLE sync_state (key text primary key, value text not null, updated_at integer not null);
    INSERT INTO sync_state (key, value, updated_at) VALUES
      ('last_import_at', '2026-08-05T16:43:18.391009Z', 1785948198),
      ('source_path', '/tmp/whatsapp-container', 1785948198);
  `);
  syncedDb.close();

  argsLogPath = path.join(tmpDir, 'args.log');
  bins.ok = writeFakeBin('wacrawl-ok', `echo "$@" > "${argsLogPath}"\necho "sync: complete"\nexit 0`);
  bins.failing = writeFakeBin(
    'wacrawl-failing',
    'echo "sync: syncing WhatsApp Desktop snapshot"\n'
    + 'echo "source contains multiple WhatsApp account identities and cannot be imported safely" >&2\n'
    + 'exit 1',
  );
  bins.slow = writeFakeBin('wacrawl-slow', 'sleep 1\nexit 0');

  const port = await freePort();
  process.env.PORT = String(port);
  process.env.WACRAWL_DB = plainDbPath;
  // Stored overrides outrank env, so point the override file somewhere empty —
  // otherwise the developer's real ~/.wacrawl archive is what gets queried.
  process.env.WACRAWL_PATHS_FILE = path.join(tmpDir, 'no-such-paths.json');

  // Imported after PORT/WACRAWL_DB are set — the app reads both at module load.
  const { createApp } = await import('../index.js');
  server = createApp().listen(port, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetSyncJob();
  process.env.WACRAWL_DB = plainDbPath;
  process.env.WACRAWL_BIN = bins.ok;
  delete process.env.WACRAWL_DISABLE_SYNC;
});

afterEach(() => {
  delete process.env.WACRAWL_BIN;
  delete process.env.WACRAWL_DISABLE_SYNC;
});

describe('GET /api/sync/status', () => {
  it('reports an idle job and refuses to be cached', async () => {
    const response = await fetch(`${baseUrl}/api/sync/status`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      enabled: true,
      job: { state: 'idle', error: null, hint: null },
    });
  });

  it('surfaces the last import recorded in the archive', async () => {
    process.env.WACRAWL_DB = syncedDbPath;

    await expect(readStatus()).resolves.toMatchObject({
      archive: {
        lastImportAt: '2026-08-05T16:43:18.391009Z',
        sourcePath: '/tmp/whatsapp-container',
      },
    });
  });

  it('reports an unknown last import for archives with no sync_state table', async () => {
    await expect(readStatus()).resolves.toMatchObject({
      archive: { lastImportAt: null, sourcePath: null },
    });
  });

  it('reports sync as disabled when WACRAWL_DISABLE_SYNC is set', async () => {
    process.env.WACRAWL_DISABLE_SYNC = '1';

    await expect(readStatus()).resolves.toMatchObject({ enabled: false });
  });
});

describe('POST /api/sync', () => {
  it('rejects a request without the dashboard header', async () => {
    const response = await startSyncRequest({});

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MISSING_REQUEST_HEADER' },
    });
    // Most importantly, no process was started.
    await expect(readStatus()).resolves.toMatchObject({ job: { state: 'idle' } });
  });

  it('rejects a request when sync is disabled by env', async () => {
    process.env.WACRAWL_DISABLE_SYNC = '1';

    const response = await startSyncRequest();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'SYNC_DISABLED' } });
    await expect(readStatus()).resolves.toMatchObject({ job: { state: 'idle' } });
  });

  it('accepts the job and reports success once the CLI exits cleanly', async () => {
    const response = await startSyncRequest();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ job: { state: 'running' } });

    const job = await waitForJobState('succeeded');
    expect(job.error).toBeNull();
    expect(job.finishedAt).not.toBeNull();
  });

  it('points the CLI at the resolved archive path', async () => {
    await startSyncRequest();
    await waitForJobState('succeeded');

    expect(fs.readFileSync(argsLogPath, 'utf8').trim()).toBe(`--db ${plainDbPath} sync`);
  });

  it('refuses a second import while one is in flight', async () => {
    process.env.WACRAWL_BIN = bins.slow;

    const first = await startSyncRequest();
    expect(first.status).toBe(202);

    const second = await startSyncRequest();
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({
      error: { code: 'SYNC_ALREADY_RUNNING' },
      job: { state: 'running' },
    });

    await waitForJobState('succeeded');
  });

  it('surfaces the CLI failure with an adopt-source hint', async () => {
    process.env.WACRAWL_BIN = bins.failing;

    await startSyncRequest();
    const job = await waitForJobState('failed');

    expect(job.error).toContain('multiple WhatsApp account identities');
    expect(job.hint).toContain('--adopt-source');
  });

  it('reports a missing CLI instead of hanging', async () => {
    process.env.WACRAWL_BIN = path.join(tmpDir, 'definitely-not-installed');

    await startSyncRequest();
    const job = await waitForJobState('failed');

    expect(job.error).toContain('was not found');
    expect(job.hint).toContain('WACRAWL_BIN');
  });

  it('allows a new import after the previous one finished', async () => {
    await startSyncRequest();
    await waitForJobState('succeeded');

    const again = await startSyncRequest();
    expect(again.status).toBe(202);
    await waitForJobState('succeeded');
  });
});

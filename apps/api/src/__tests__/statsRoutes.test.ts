import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './testDb.js';

let server: Server;
let baseUrl: string;
let tmpDir: string;

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

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-stats-'));
  const dbPath = path.join(tmpDir, 'archive.db');
  createTestDb(dbPath).close();

  const port = await freePort();
  process.env.PORT = String(port);
  process.env.WACRAWL_DB = dbPath;
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

describe('GET /api/stats/* caching', () => {
  it('serves stats with a strong etag and a revalidating cache policy', async () => {
    const response = await fetch(`${baseUrl}/api/stats/overview`);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toMatch(/^"[\w-]+"$/);
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    await expect(response.json()).resolves.toMatchObject({ totalMessages: 6 });
  });

  it('answers a matching If-None-Match with 304 and no body', async () => {
    const first = await fetch(`${baseUrl}/api/stats/overview`);
    const etag = first.headers.get('etag')!;
    await first.json();

    const revalidated = await fetch(`${baseUrl}/api/stats/overview`, {
      headers: { 'If-None-Match': etag },
    });

    expect(revalidated.status).toBe(304);
    await expect(revalidated.text()).resolves.toBe('');
  });

  it('issues distinct etags per route and per query', async () => {
    const [overview, dayStreaks, weekStreaks] = await Promise.all([
      fetch(`${baseUrl}/api/stats/overview`),
      fetch(`${baseUrl}/api/stats/streaks?period=day`),
      fetch(`${baseUrl}/api/stats/streaks?period=week`),
    ]);
    await Promise.all([overview.json(), dayStreaks.json(), weekStreaks.json()]);

    const etags = [overview, dayStreaks, weekStreaks].map((r) => r.headers.get('etag'));
    expect(new Set(etags).size).toBe(3);
  });

  it('returns identical payloads on a cache hit', async () => {
    const first = await fetch(`${baseUrl}/api/stats/top-contacts?period=all&limit=5`);
    const second = await fetch(`${baseUrl}/api/stats/top-contacts?period=all&limit=5`);

    expect(first.headers.get('etag')).toBe(second.headers.get('etag'));
    await expect(second.json()).resolves.toEqual(await first.json());
  });
});

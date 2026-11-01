import fs from 'node:fs';
import type { Server } from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearDashboardPathsOverride, invalidateDashboardPathsCache, writeDashboardPathsOverride } from '../pathsResolve.js';
import { createTestDb } from './testDb.js';

let server: Server;
let baseUrl: string;
let tmpDir: string;
let otherDb: string;

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

async function health(): Promise<{ ok: boolean; demo: boolean }> {
  return await (await fetch(`${baseUrl}/api/health`)).json() as { ok: boolean; demo: boolean };
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-demo-health-'));
  const dbPath = path.join(tmpDir, 'archive.db');
  otherDb = path.join(tmpDir, 'other.db');
  createTestDb(dbPath).close();
  createTestDb(otherDb).close();

  const port = await freePort();
  process.env.PORT = String(port);
  process.env.WACRAWL_DB = dbPath;
  process.env.WACRAWL_PATHS_FILE = path.join(tmpDir, 'paths.json');
  invalidateDashboardPathsCache();

  const { createApp } = await import('../index.js');
  server = createApp().listen(port, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  delete process.env.WACRAWL_DEMO;
  clearDashboardPathsOverride();
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/health demo flag', () => {
  it('is false on a normal run', async () => {
    await expect(health()).resolves.toMatchObject({ ok: true, demo: false });
  });

  it('is true when launched with --demo', async () => {
    process.env.WACRAWL_DEMO = '1';

    await expect(health()).resolves.toMatchObject({ ok: true, demo: true });
  });

  it('goes false once Settings points a demo at another archive', async () => {
    process.env.WACRAWL_DEMO = '1';
    writeDashboardPathsOverride({ primaryDb: otherDb });

    await expect(health()).resolves.toMatchObject({ ok: true, demo: false });
  });
});

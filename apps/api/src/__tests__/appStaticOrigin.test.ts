import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './testDb.js';

let server: Server;
let port: number;
let baseUrl: string;
let tmpDir: string;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: free } = probe.address() as AddressInfo;
      probe.close(() => resolve(free));
    });
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-static-origin-'));
  const staticDir = path.join(tmpDir, 'web');
  fs.mkdirSync(staticDir);
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<title>dashboard</title>');

  const dbPath = path.join(tmpDir, 'archive.db');
  createTestDb(dbPath).close();

  port = await freePort();
  process.env.PORT = String(port);
  process.env.WACRAWL_DB = dbPath;
  process.env.WACRAWL_PATHS_FILE = path.join(tmpDir, 'paths.json');
  // How the npx launcher runs the API: it serves its own UI.
  process.env.WACRAWL_STATIC_DIR = staticDir;

  const { createApp } = await import('../index.js');
  server = createApp().listen(port, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete process.env.WACRAWL_STATIC_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CORS when the API serves its own UI', () => {
  it('allows the dashboard on either loopback name', async () => {
    for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`]) {
      const response = await fetch(`${baseUrl}/api/stats/overview`, { headers: { Origin: origin } });
      expect(response.status).toBe(200);
    }
  });

  it('blocks reads from a site on another local port', async () => {
    // MAMP, or any dev server, runs code the archive owner did not write.
    const response = await fetch(`${baseUrl}/api/stats/overview`, {
      headers: { Origin: 'http://localhost:8888' },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN_ORIGIN' } });
  });

  it('blocks settings writes from a site on another local port', async () => {
    const response = await fetch(`${baseUrl}/api/settings/paths`, {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:9999', 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryDb: '/tmp/other.db' }),
    });

    expect(response.status).toBe(403);
    expect(fs.existsSync(process.env.WACRAWL_PATHS_FILE!)).toBe(false);
  });

  it('blocks the same host on another scheme', async () => {
    const response = await fetch(`${baseUrl}/api/stats/overview`, {
      headers: { Origin: `https://127.0.0.1:${port}` },
    });

    expect(response.status).toBe(403);
  });

  it('still serves the UI to a same-origin page load', async () => {
    const response = await fetch(`${baseUrl}/people`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('dashboard');
  });
});

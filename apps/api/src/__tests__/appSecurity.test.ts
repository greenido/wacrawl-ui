import fs from 'node:fs';
import http from 'node:http';
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
let indexedMediaPath: string;
let strayFilePath: string;

/** Reserve a free port so the app's own localhost Host allowlist matches. */
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

/** fetch() will not let us forge the Host header, so go through node:http. */
function getWithHost(pathname: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function mediaUrl(filePath: string): string {
  return `${baseUrl}/api/media/file?path=${encodeURIComponent(filePath)}`;
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-security-'));

  indexedMediaPath = path.join(tmpDir, 'photo.jpg');
  fs.writeFileSync(indexedMediaPath, 'fake-jpeg-bytes');
  // Readable by the server, but no message row points at it.
  strayFilePath = path.join(tmpDir, 'secrets.txt');
  fs.writeFileSync(strayFilePath, 'not for the browser');

  const dbPath = path.join(tmpDir, 'archive.db');
  const db = createTestDb(dbPath);
  db.prepare(`
    INSERT INTO messages (source_pk, chat_jid, msg_id, ts, from_me, text, raw_type, media_type, media_path)
    VALUES (100, 'alice@s.whatsapp.net', 'media-1', 1700000000, 0, NULL, 0, 'image', ?)
  `).run(indexedMediaPath);
  db.close();

  port = await freePort();
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

describe('Host allowlist', () => {
  it('rejects a rebound hostname even though the socket is loopback', async () => {
    // DNS rebinding: attacker.example resolves to 127.0.0.1, so only the Host
    // header tells this request apart from the dashboard's own.
    const response = await getWithHost('/api/stats/overview', `attacker.example:${port}`);

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'FORBIDDEN_HOST' } });
  });

  it('serves the dashboard on localhost', async () => {
    expect((await getWithHost('/api/stats/overview', `localhost:${port}`)).status).toBe(200);
  });
});

describe('CORS', () => {
  it('blocks a cross-site origin before the route runs', async () => {
    const response = await fetch(`${baseUrl}/api/stats/overview`, {
      headers: { Origin: 'https://evil.example.com' },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('GET /api/media/file', () => {
  it('serves a file the archive indexes as media', async () => {
    const response = await fetch(mediaUrl(indexedMediaPath));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('fake-jpeg-bytes');
  });

  it('refuses any path the archive does not index', async () => {
    // The DB lookup is the only thing standing between this endpoint and an
    // arbitrary local file read.
    for (const filePath of [strayFilePath, '/etc/passwd', `${tmpDir}/../${path.basename(tmpDir)}/secrets.txt`]) {
      const response = await fetch(mediaUrl(filePath));
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
  });
});

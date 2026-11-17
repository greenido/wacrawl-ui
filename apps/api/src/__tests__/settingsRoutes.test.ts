import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { invalidateDashboardPathsCache } from '../pathsResolve.js';
import { createTestDb } from './testDb.js';

let server: Server;
let baseUrl: string;
let tmpDir: string;
let archivePath: string;
let otherArchivePath: string;
let pathsFile: string;

const DASHBOARD = { 'X-Wacrawl-Request': '1' };

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

function savePaths(body: unknown, headers: Record<string, string> = DASHBOARD) {
  return fetch(`${baseUrl}/api/settings/paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-settings-'));
  archivePath = path.join(tmpDir, 'archive.db');
  otherArchivePath = path.join(tmpDir, 'other.db');
  createTestDb(archivePath).close();
  createTestDb(otherArchivePath).close();
  pathsFile = path.join(tmpDir, 'paths.json');

  const port = await freePort();
  process.env.PORT = String(port);
  process.env.WACRAWL_DB = archivePath;
  process.env.WACRAWL_PATHS_FILE = pathsFile;
  process.env.WACRAWL_MEDIA_ROOT = tmpDir;

  const { createApp } = await import('../index.js');
  server = createApp().listen(port, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  fs.rmSync(pathsFile, { force: true });
  invalidateDashboardPathsCache();
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/settings/paths', () => {
  it('refuses a request without the dashboard header', async () => {
    const response = await savePaths({ primaryDb: otherArchivePath }, {});

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MISSING_REQUEST_HEADER' } });
    expect(fs.existsSync(pathsFile)).toBe(false);
  });

  it('switches to another SQLite archive', async () => {
    const response = await savePaths({ primaryDb: otherArchivePath });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ effective: { primaryDb: otherArchivePath } });
  });

  it('refuses an archive that does not exist, so sync cannot create files anywhere', async () => {
    const response = await savePaths({ primaryDb: path.join(tmpDir, 'nowhere', 'new.db') });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(fs.existsSync(pathsFile)).toBe(false);
  });

  it('refuses a file that is not an SQLite database', async () => {
    const notSqlite = path.join(tmpDir, 'notes.txt');
    fs.writeFileSync(notSqlite, 'just some text, not a database');

    const response = await savePaths({ primaryDb: notSqlite });

    expect(response.status).toBe(400);
    expect(fs.existsSync(pathsFile)).toBe(false);
  });

  it('refuses a directory as the archive', async () => {
    const response = await savePaths({ primaryDb: tmpDir });

    expect(response.status).toBe(400);
  });

  it('refuses relative paths and non-string values', async () => {
    for (const body of [{ mediaRoot: 'media' }, { primaryDb: '../archive.db' }, { mediaRoot: 42 }, ['/tmp']]) {
      const response = await savePaths(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(fs.existsSync(pathsFile)).toBe(false);
  });

  it('accepts the form sent back unchanged, even when other fields name missing paths', async () => {
    // The Settings page posts every field, including derived ones that may not exist.
    const response = await savePaths({
      primaryDb: archivePath,
      mediaRoot: path.join(tmpDir, 'media-not-created-yet'),
      chatDb: '',
      contactsDb: '',
      whatsappContainer: '',
    });

    expect(response.status).toBe(200);
  });
});

describe('DELETE /api/settings/paths', () => {
  it('refuses a request without the dashboard header', async () => {
    fs.writeFileSync(pathsFile, JSON.stringify({ primaryDb: otherArchivePath }));
    invalidateDashboardPathsCache();

    const response = await fetch(`${baseUrl}/api/settings/paths`, { method: 'DELETE' });

    expect(response.status).toBe(403);
    expect(fs.existsSync(pathsFile)).toBe(true);
  });

  it('resets with the header', async () => {
    fs.writeFileSync(pathsFile, JSON.stringify({ primaryDb: otherArchivePath }));
    invalidateDashboardPathsCache();

    const response = await fetch(`${baseUrl}/api/settings/paths`, { method: 'DELETE', headers: DASHBOARD });

    expect(response.status).toBe(200);
    expect(fs.existsSync(pathsFile)).toBe(false);
  });
});

describe('per-request path headers', () => {
  it('are ignored, so a caller cannot point the server at another database', async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { 'X-Wacrawl-Db': otherArchivePath, 'X-Wacrawl-Media-Root': '/' },
    });

    const body = await response.json() as { dbPath: string; paths: { mediaRoot: string } };
    expect(body.dbPath).toBe(archivePath);
    expect(body.paths.mediaRoot).toBe(tmpDir);
  });
});

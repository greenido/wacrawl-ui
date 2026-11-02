#!/usr/bin/env node
/**
 * What a stranger gets from `npx wacrawl-dashboard --demo`: pack the build, install
 * the tarball somewhere with no access to this repo's node_modules, and run it.
 * Needs `npm run build` first. HOME is pointed at an empty directory so a real
 * ~/.wacrawl on this machine cannot make the check pass, or be touched by it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = resolve(import.meta.dirname, '..');
const PORT = '3198';
const base = `http://127.0.0.1:${PORT}`;

const scratch = mkdtempSync(join(tmpdir(), 'wacrawl-fresh-install-'));
const home = join(scratch, 'home');
const project = join(scratch, 'project');
mkdirSync(home);
mkdirSync(project);

let server;
try {
  console.log('Packing…');
  const [{ filename }] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', scratch], {
    cwd: repoRoot,
    encoding: 'utf8',
  }));

  console.log(`Installing ${filename} on Node ${process.version}…`);
  writeFileSync(join(project, 'package.json'), '{"name":"fresh-install-check","private":true}\n');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', join(scratch, filename)], {
    cwd: project,
    stdio: 'inherit',
    env: process.env,
  });

  const installed = join(project, 'node_modules');
  const devOnly = ['vite', 'playwright', 'typescript'].filter((name) => existsSync(join(installed, name)));
  if (devOnly.length > 0) throw new Error(`dev dependencies leaked into the install: ${devOnly.join(', ')}`);

  // Somebody's real configuration, which --demo has to ignore in favour of its own archive.
  writeFileSync(join(project, '.env'), 'WACRAWL_DB=/no/such/real.db\nWACRAWL_CHAT_DB=/no/such/ChatStorage.sqlite\n');

  console.log('Starting --demo…');
  server = spawn(process.execPath, [join(installed, '.bin', 'wacrawl-dashboard'), '--demo'], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, HOME: home, PORT, WACRAWL_DB: '/no/such/other.db' },
  });
  const exited = new Promise((_, reject) => {
    server.once('exit', (code) => reject(new Error(`server exited early with code ${code}`)));
  });

  const ready = (async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) return response.json();
      } catch {
        // Not listening yet.
      }
      await delay(500);
    }
    throw new Error('server never became healthy');
  })();
  const health = await Promise.race([ready, exited]);

  if (!health.ok || !health.demo || !health.mediaAccessible || health.paths.chatDb !== null) {
    throw new Error(`unexpected health: ${JSON.stringify(health)}`);
  }

  const overview = await (await fetch(`${base}/api/stats/overview`)).json();
  if (!(overview.totalMessages > 1000)) throw new Error(`unexpected overview: ${JSON.stringify(overview)}`);

  const search = await (await fetch(`${base}/api/search?q=lighthouse`)).json();
  if (search.data.length === 0) throw new Error('search found nothing');

  const page = await fetch(`${base}/`);
  const html = await page.text();
  if (!page.ok || !html.includes('<div id="root"')) throw new Error('the web app was not served');

  if (existsSync(join(home, '.wacrawl')) && readdirSync(join(home, '.wacrawl')).length > 0) {
    throw new Error('--demo wrote to ~/.wacrawl');
  }

  console.log(`OK: ${overview.totalMessages} demo messages served from a fresh install on Node ${process.version}.`);
} finally {
  server?.removeAllListeners('exit');
  server?.kill('SIGTERM');
  await delay(300);
  rmSync(scratch, { recursive: true, force: true });
}

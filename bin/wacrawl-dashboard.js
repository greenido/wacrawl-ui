#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');

const pkgRoot = join(__dirname, '..');
const apiEntry = join(pkgRoot, 'apps', 'api', 'dist', 'index.js');
const demoEntry = join(pkgRoot, 'apps', 'api', 'dist', 'demo', 'demoArchive.js');
const webDist  = join(pkgRoot, 'apps', 'web', 'dist');

if (!existsSync(apiEntry)) {
  console.error(
    'wacrawl-dashboard: build artifacts missing.\n' +
    'Run `npm run build` inside the repository first, then try again.'
  );
  process.exit(1);
}

const PORT = process.env.PORT ?? '3001';
const url  = `http://127.0.0.1:${PORT}`;

/**
 * Generate a throwaway archive and an environment pointing at nothing but it.
 *
 * The blank paths matter: dotenv never overrides a variable that is already set,
 * so they stop an apps/api/.env in the current directory from naming a real
 * archive. The API then reads no file of the user's, and the paths file being
 * temporary keeps any Settings changes made during the demo out of their config.
 */
async function prepareDemo() {
  const dir = mkdtempSync(join(tmpdir(), 'wacrawl-demo-'));
  try {
    const { generateDemoArchive } = await import(pathToFileURL(demoEntry).href);
    const archive = generateDemoArchive({ dir });
    console.log(`  Demo mode: ${archive.messages.toLocaleString('en-US')} invented messages. Your own archive is not touched.`);
    return {
      dir,
      env: {
        WACRAWL_DEMO: '1',
        WACRAWL_DB: archive.dbPath,
        WACRAWL_MEDIA_ROOT: archive.mediaRoot,
        WACRAWL_PATHS_FILE: join(dir, 'dashboard-paths.json'),
        WACRAWL_DISABLE_SYNC: '1',
        WACRAWL_WHATSAPP_CONTAINER: '',
        WACRAWL_CHAT_DB: '',
        WACRAWL_CONTACTS_DB: '',
      },
    };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  console.log(`WaCrawl Dashboard → ${url}`);

  const demo = process.argv.includes('--demo') ? await prepareDemo() : null;
  if (!demo && !process.env.WACRAWL_DB) {
    console.log('  Database: ~/.wacrawl/wacrawl.db  (override with WACRAWL_DB=<path>)');
  }

  const child = spawn(process.execPath, [apiEntry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...demo?.env,
      WACRAWL_STATIC_DIR: webDist,
      PORT,
    },
  });

  child.on('exit', (code) => {
    if (demo) rmSync(demo.dir, { recursive: true, force: true });
    process.exit(code ?? 0);
  });

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => child.kill(sig));
  }
}

main().catch((error) => {
  console.error(`wacrawl-dashboard: ${error.message}`);
  process.exit(1);
});

#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { existsSync } = require('node:fs');

const pkgRoot = join(__dirname, '..');
const apiEntry = join(pkgRoot, 'apps', 'api', 'dist', 'index.js');
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

console.log(`WaCrawl Dashboard → ${url}`);
if (!process.env.WACRAWL_DB) {
  console.log('  Database: ~/.wacrawl/wacrawl.db  (override with WACRAWL_DB=<path>)');
}

const child = spawn(process.execPath, [apiEntry], {
  stdio: 'inherit',
  env: {
    ...process.env,
    WACRAWL_STATIC_DIR: webDist,
    PORT,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

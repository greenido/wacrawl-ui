import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_DEMO_SEED, generateDemoArchive } from '../demo/demoArchive.js';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    seed: { type: 'string', default: String(DEFAULT_DEMO_SEED) },
    now: { type: 'string' },
  },
});

const seed = Number(values.seed);
const now = values.now ? new Date(values.now) : new Date();
if (!Number.isInteger(seed) || Number.isNaN(now.getTime())) {
  console.error('Usage: generateDemoArchive [--out <dir>] [--seed <integer>] [--now <ISO date>]');
  process.exit(1);
}

const dir = values.out ? path.resolve(values.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-demo-'));
const startedAt = Date.now();
const archive = generateDemoArchive({ dir, seed, now });

console.log(`Wrote ${archive.messages} messages across ${archive.chats} chats in ${Date.now() - startedAt}ms.`);
console.log(`WACRAWL_DB=${archive.dbPath}`);
console.log(`WACRAWL_MEDIA_ROOT=${archive.mediaRoot}`);

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

/**
 * Opening an archive starts a background search-index build, and the default
 * index location is in the home directory. Point every test file at its own
 * throwaway file so no test run ever writes there.
 */
if (!process.env.WACRAWL_SEARCH_INDEX) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-test-index-'));
  process.env.WACRAWL_SEARCH_INDEX = path.join(dir, 'dashboard-index.db');
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

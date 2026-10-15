import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDashboardPathsOverride,
  readDashboardPathsOverride,
  writeDashboardPathsOverride,
} from '../pathsResolve.js';

describe('pathsResolve override memoization', () => {
  let tmpDir: string;
  let pathsFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrawl-paths-test-'));
    pathsFile = path.join(tmpDir, 'dashboard-paths.json');
    vi.stubEnv('WACRAWL_PATHS_FILE', pathsFile);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('memoizes missing override file across repeated reads and updates on write/clear', () => {
    const readSpy = vi.spyOn(fs, 'readFileSync');

    expect(readDashboardPathsOverride()).toBeNull();
    expect(readDashboardPathsOverride()).toBeNull();
    expect(readSpy).toHaveBeenCalledTimes(1);

    writeDashboardPathsOverride({ primaryDb: '/tmp/custom.db' });
    expect(readDashboardPathsOverride()).toEqual({ primaryDb: '/tmp/custom.db' });
    expect(readDashboardPathsOverride()).toEqual({ primaryDb: '/tmp/custom.db' });
    // writeDashboardPathsOverride updates the in-memory cache without re-reading disk
    expect(readSpy).toHaveBeenCalledTimes(1);

    clearDashboardPathsOverride();
    expect(readDashboardPathsOverride()).toBeNull();
    expect(readDashboardPathsOverride()).toBeNull();
    expect(readSpy).toHaveBeenCalledTimes(1);
  });
});

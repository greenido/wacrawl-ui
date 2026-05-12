import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArchiveMediaRoot, resolveArchiveMediaPath } from '../lib/mediaFsPath.js';

describe('mediaFsPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves file:// URLs to absolute paths', () => {
    const resolved = resolveArchiveMediaPath(`file://${path.join('/tmp', 'x', 'photo.jpg')}`);
    expect(resolved).toBe(path.resolve('/tmp/x/photo.jpg'));
  });

  it('joins relative paths against WACRAWL_MEDIA_ROOT when set', () => {
    const root = path.join(os.tmpdir(), 'wa-media-root');
    vi.stubEnv('WACRAWL_MEDIA_ROOT', root);
    expect(resolveArchiveMediaPath('Messages/Media/foo.jpg')).toBe(path.resolve(root, 'Messages/Media/foo.jpg'));
  });

  it('uses DB parent directory as default root for relative paths', () => {
    vi.stubEnv('WACRAWL_DB', path.join(os.tmpdir(), 'archive', 'wacrawl.db'));
    const root = getArchiveMediaRoot();
    expect(root).toBe(path.join(os.tmpdir(), 'archive'));
    expect(resolveArchiveMediaPath('relative/pic.png')).toBe(path.join(root, 'relative', 'pic.png'));
  });
});

import { Router } from 'express';

import {
  readArchiveSyncInfo,
  startSync,
  syncEnabled,
  syncJobStatus,
} from '../lib/archiveSync.js';
import { requireDashboardRequest } from '../lib/requestGuard.js';
import { getResolvedPaths } from '../runtimePaths.js';

export const syncRouter = Router();

syncRouter.get('/status', (_req, res) => {
  // Job state changes second to second while an import runs; a cached poll
  // response would report a finished sync as still running.
  res.setHeader('Cache-Control', 'no-store');

  res.json({
    enabled: syncEnabled(),
    job: syncJobStatus(),
    archive: readArchiveSyncInfo(),
  });
});

// Spawns a process, so it must come from the dashboard, not a stray cross-origin POST.
syncRouter.post('/', requireDashboardRequest,(_req, res) => {
  if (!syncEnabled()) {
    res.status(403).json({
      error: {
        code: 'SYNC_DISABLED',
        message: 'Archive sync is disabled by WACRAWL_DISABLE_SYNC.',
      },
    });
    return;
  }

  const { primaryDb } = getResolvedPaths();
  const { started, job } = startSync(primaryDb);

  if (!started) {
    res.status(409).json({
      error: {
        code: 'SYNC_ALREADY_RUNNING',
        message: 'An archive sync is already running.',
      },
      job,
    });
    return;
  }

  res.status(202).json({ job });
});

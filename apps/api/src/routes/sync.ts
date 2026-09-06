import { Router, type RequestHandler } from 'express';

import {
  readArchiveSyncInfo,
  startSync,
  syncEnabled,
  syncJobStatus,
} from '../lib/archiveSync.js';
import { getResolvedPaths } from '../runtimePaths.js';

export const syncRouter = Router();

/**
 * Every other route here is a readonly GET, so CORS hiding the response body is
 * protection enough. This one spawns a process, and CORS does not stop the
 * request from arriving — a page on any origin can fire a "simple" cross-origin
 * POST at 127.0.0.1 and never read the reply.
 *
 * Requiring a header the browser does not consider simple forces a preflight,
 * which the origin check in `createApp` rejects for anything but loopback.
 */
export const SYNC_REQUEST_HEADER = 'x-wacrawl-request';

const requireDashboardOrigin: RequestHandler = (req, res, next) => {
  if (req.headers[SYNC_REQUEST_HEADER] !== '1') {
    res.status(403).json({
      error: {
        code: 'MISSING_REQUEST_HEADER',
        message: `Sync requests must send ${SYNC_REQUEST_HEADER}: 1.`,
      },
    });
    return;
  }
  next();
};

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

syncRouter.post('/', requireDashboardOrigin, (_req, res) => {
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

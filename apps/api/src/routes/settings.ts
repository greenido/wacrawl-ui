import { Router } from 'express';
import { closeDb } from '../db.js';
import {
  clearDashboardPathsOverride,
  mergePathPatch,
  readDashboardPathsOverride,
  resolvePathsFromEnv,
  resolvePathsForRequest,
  writeDashboardPathsOverride,
  type PathPatch,
  type StoredDashboardPaths,
} from '../pathsResolve.js';

export const settingsRouter = Router();

settingsRouter.get('/paths', (req, res) => {
  const envDefaults = resolvePathsFromEnv();
  const storedOverride = readDashboardPathsOverride();
  const effective = resolvePathsForRequest(req.headers);

  res.json({
    envDefaults,
    storedOverride,
    effective,
    pathsFile: Boolean(storedOverride && Object.keys(storedOverride).length > 0),
  });
});

settingsRouter.post('/paths', (req, res) => {
  const body = req.body as StoredDashboardPaths | undefined;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'JSON body required.' } });
    return;
  }

  const patch: PathPatch = {
    whatsappContainer: typeof body.whatsappContainer === 'string' ? body.whatsappContainer : undefined,
    chatDb: typeof body.chatDb === 'string' ? body.chatDb : undefined,
    contactsDb: typeof body.contactsDb === 'string' ? body.contactsDb : undefined,
    mediaRoot: typeof body.mediaRoot === 'string' ? body.mediaRoot : undefined,
    primaryDb: typeof body.primaryDb === 'string' ? body.primaryDb : undefined,
  };

  writeDashboardPathsOverride(patch);
  closeDb();

  const effective = mergePathPatch(resolvePathsFromEnv(), patch);
  res.json({ ok: true, effective });
});

settingsRouter.delete('/paths', (_req, res) => {
  clearDashboardPathsOverride();
  closeDb();
  res.json({ ok: true, effective: resolvePathsFromEnv() });
});

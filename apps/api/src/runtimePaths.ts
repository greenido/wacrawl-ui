import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { ResolvedPaths } from './pathsResolve.js';
import { resolvePathsForRequest } from './pathsResolve.js';

export const requestPathsStore = new AsyncLocalStorage<ResolvedPaths>();

export function getResolvedPaths(): ResolvedPaths {
  return requestPathsStore.getStore() ?? resolvePathsForRequest({});
}

export function pathsMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const merged = resolvePathsForRequest(req.headers);
  requestPathsStore.run(merged, next);
}

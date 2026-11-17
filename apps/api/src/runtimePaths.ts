import type { ResolvedPaths } from './pathsResolve.js';
import { resolveEffectivePaths } from './pathsResolve.js';

export function getResolvedPaths(): ResolvedPaths {
  return resolveEffectivePaths();
}

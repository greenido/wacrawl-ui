import fs from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import os from 'node:os';
import path from 'node:path';

export interface ResolvedPaths {
  whatsappContainer: string | null;
  chatDb: string | null;
  contactsDb: string | null;
  mediaRoot: string;
  primaryDb: string;
}

export type PathPatch = Partial<{
  whatsappContainer: string | null;
  chatDb: string | null;
  contactsDb: string | null;
  mediaRoot: string | null;
  primaryDb: string | null;
}>;

export type StoredDashboardPaths = PathPatch;

export function expandPath(p: string): string {
  const t = p.trim();
  if (!t) return t;
  if (t.startsWith('~/')) return path.join(os.homedir(), t.slice(2));
  return path.normalize(t);
}

function trimEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const t = raw.trim();
  return t || undefined;
}

export function dashboardPathsFile(): string {
  const envPath = process.env.WACRAWL_PATHS_FILE?.trim();
  if (envPath) {
    return envPath.startsWith('~/') ? path.join(os.homedir(), envPath.slice(2)) : path.resolve(envPath);
  }
  return path.join(os.homedir(), '.wacrawl', 'dashboard-paths.json');
}

export function readDashboardPathsOverride(): StoredDashboardPaths | null {
  try {
    const raw = fs.readFileSync(dashboardPathsFile(), 'utf8');
    const parsed = JSON.parse(raw) as StoredDashboardPaths;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDashboardPathsOverride(data: StoredDashboardPaths): void {
  const filePath = dashboardPathsFile();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function clearDashboardPathsOverride(): void {
  try {
    fs.unlinkSync(dashboardPathsFile());
  } catch {
    // Missing file is fine.
  }
}

export function resolvePathsFromEnv(): ResolvedPaths {
  const DEFAULT_DB = path.join(os.homedir(), '.wacrawl', 'wacrawl.db');

  const containerRaw = trimEnv('WACRAWL_WHATSAPP_CONTAINER');
  const whatsappContainer = containerRaw ? expandPath(containerRaw) : null;

  const derivedChatDb = whatsappContainer ? path.join(whatsappContainer, 'ChatStorage.sqlite') : null;
  const derivedContactsDb = whatsappContainer ? path.join(whatsappContainer, 'ContactsV2.sqlite') : null;
  const derivedMediaRoot = whatsappContainer ? path.join(whatsappContainer, 'Message', 'Media') : null;

  const explicitChatDb = trimEnv('WACRAWL_CHAT_DB');
  const chatDb = explicitChatDb ? expandPath(explicitChatDb) : derivedChatDb;

  const explicitContactsDb = trimEnv('WACRAWL_CONTACTS_DB');
  const contactsDb = explicitContactsDb ? expandPath(explicitContactsDb) : derivedContactsDb;

  const explicitPrimary = trimEnv('WACRAWL_DB');
  const primaryDb = explicitPrimary ? expandPath(explicitPrimary) : chatDb ?? DEFAULT_DB;

  const explicitMediaRoot = trimEnv('WACRAWL_MEDIA_ROOT');
  const mediaRoot = explicitMediaRoot ? expandPath(explicitMediaRoot) : derivedMediaRoot ?? path.dirname(primaryDb);

  return {
    whatsappContainer,
    chatDb,
    contactsDb,
    mediaRoot,
    primaryDb,
  };
}

function patchPick(patch: PathPatch, key: keyof PathPatch): string | undefined {
  if (!(key in patch)) return undefined;
  const v = patch[key];
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  return t ? expandPath(t) : undefined;
}

/** Layer overrides onto base (env → dashboard file → …). Later callers may merge headers the same way. */
export function mergePathPatch(base: ResolvedPaths, patch: PathPatch): ResolvedPaths {
  const whatsappContainer = patchPick(patch, 'whatsappContainer') ?? base.whatsappContainer;

  const derivedChatDb = whatsappContainer ? path.join(whatsappContainer, 'ChatStorage.sqlite') : null;
  const derivedContactsDb = whatsappContainer ? path.join(whatsappContainer, 'ContactsV2.sqlite') : null;
  const derivedMediaRoot = whatsappContainer ? path.join(whatsappContainer, 'Message', 'Media') : null;

  const chatDb = patchPick(patch, 'chatDb') ?? base.chatDb ?? derivedChatDb;

  const contactsDb = patchPick(patch, 'contactsDb') ?? base.contactsDb ?? derivedContactsDb;

  const DEFAULT_DB = path.join(os.homedir(), '.wacrawl', 'wacrawl.db');

  const primaryDb =
    patchPick(patch, 'primaryDb') ??
    base.primaryDb ??
    chatDb ??
    DEFAULT_DB;

  const mediaRoot =
    patchPick(patch, 'mediaRoot') ??
    base.mediaRoot ??
    derivedMediaRoot ??
    path.dirname(primaryDb);

  return {
    whatsappContainer,
    chatDb,
    contactsDb,
    mediaRoot,
    primaryDb,
  };
}

function headerString(headers: IncomingHttpHeaders, lowerName: string): string | undefined {
  const v = headers[lowerName];
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return expandPath(raw.trim());
}

/** Optional per-request overrides from the UI (fetch API); `<img>` tags cannot send these—prefer POST /api/settings/paths. */
export function mergeHeaderPathOverrides(headers: IncomingHttpHeaders, base: ResolvedPaths): ResolvedPaths {
  const patch: PathPatch = {};
  const c = headerString(headers, 'x-wacrawl-whatsapp-container');
  const chat = headerString(headers, 'x-wacrawl-chat-db');
  const contacts = headerString(headers, 'x-wacrawl-contacts-db');
  const media = headerString(headers, 'x-wacrawl-media-root');
  const primary = headerString(headers, 'x-wacrawl-db');
  if (c !== undefined) patch.whatsappContainer = c;
  if (chat !== undefined) patch.chatDb = chat;
  if (contacts !== undefined) patch.contactsDb = contacts;
  if (media !== undefined) patch.mediaRoot = media;
  if (primary !== undefined) patch.primaryDb = primary;
  if (Object.keys(patch).length === 0) return base;
  return mergePathPatch(base, patch);
}

export function resolvePathsForRequest(headers: IncomingHttpHeaders): ResolvedPaths {
  let resolved = resolvePathsFromEnv();
  const stored = readDashboardPathsOverride();
  if (stored) {
    resolved = mergePathPatch(resolved, stored);
  }
  return mergeHeaderPathOverrides(headers, resolved);
}

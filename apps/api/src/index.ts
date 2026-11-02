import cors from 'cors';
import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import { ensurePrimaryDatabase } from './db.js';
import { isMediaRootAccessible } from './lib/mediaFsPath.js';
import { resolvePathsFromEnv } from './pathsResolve.js';
import { dataRouter } from './routes/data.js';
import { settingsRouter } from './routes/settings.js';
import { statsRouter } from './routes/stats.js';
import { syncRouter } from './routes/sync.js';
import { getResolvedPaths, pathsMiddleware } from './runtimePaths.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = '127.0.0.1';
const ALLOWED_HOSTS = new Set([
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
]);

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Accept any origin served from this machine. Development only: see createApp.
 *
 * Pinning the allowlist to ports 5173/4173 was brittle: Vite silently moves to
 * 5174 when 5173 is already taken, and from then on every request failed with an
 * opaque 500 that surfaced in the UI as "Cannot connect to the WaCrawl API".
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return LOOPBACK_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

/** The dashboard this server is hosting, under either name for loopback. */
function isOwnOrigin(origin: string): boolean {
  try {
    const { host, protocol } = new URL(origin);
    return protocol === 'http:' && ALLOWED_HOSTS.has(host);
  } catch {
    return false;
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // Once the response is on the wire there is no way to replace it with a JSON
  // error — writing anyway throws ERR_HTTP_HEADERS_SENT. Hand back to Express so
  // its final handler destroys the socket instead.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error?.code === 'FORBIDDEN_ORIGIN') {
    // Was an opaque 500 before, which the UI reported as "Cannot connect to the
    // WaCrawl API" with no hint that the origin was the problem.
    res.status(403).json({
      error: {
        code: 'FORBIDDEN_ORIGIN',
        message: `Blocked request from origin ${error.origin ?? 'unknown'}. Only the dashboard itself may call this API.`,
      },
    });
    return;
  }

  if (error?.code === 'CHAT_NOT_FOUND') {
    res.status(404).json({
      error: { code: 'CHAT_NOT_FOUND', message: error.message ?? 'No such chat.' },
    });
    return;
  }

  if (error?.code === 'NOT_A_GROUP') {
    res.status(400).json({
      error: { code: 'NOT_A_GROUP', message: error.message ?? 'That chat is not a group.' },
    });
    return;
  }

  const code = error?.code === 'SQLITE_CANTOPEN' ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR';
  const message = code === 'DATABASE_UNAVAILABLE'
    ? 'Cannot open the WaCrawl database. Check Settings → Archive paths, WACRAWL_DB in .env, or run wacrawl sync.'
    : 'Unexpected server error.';

  res.status(code === 'DATABASE_UNAVAILABLE' ? 503 : 500).json({
    error: {
      code,
      message,
    },
  });
};

export function createApp(): express.Express {
  const app = express();
  // Production static file serving — set WACRAWL_STATIC_DIR to the web dist folder
  const staticDir = process.env.WACRAWL_STATIC_DIR;
  // A site on another local port (MAMP, any dev server) runs code the archive
  // owner did not write, so it must not read the archive. Only development needs
  // the wider rule, because the UI then comes from Vite on a port that can move.
  const isAllowedOrigin = staticDir ? isOwnOrigin : isLoopbackOrigin;

  app.disable('x-powered-by');

  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    const host = req.headers.host;
    if (host && !ALLOWED_HOSTS.has(host)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_HOST',
          message: 'Requests must target localhost.',
        },
      });
      return;
    }
    next();
  });

  app.use(cors({
    origin(origin, callback) {
      // No Origin header: same-origin, or a non-browser client such as curl or
      // an <img> tag pointing at /api/media/file.
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(Object.assign(new Error('Origin is not allowed by CORS.'), {
        code: 'FORBIDDEN_ORIGIN',
        origin,
      }));
    },
  }));

  app.use(pathsMiddleware);

  app.get('/api/health', (_req, res) => {
    const paths = getResolvedPaths();
    let primaryDbReadable = false;
    try {
      ensurePrimaryDatabase();
      primaryDbReadable = true;
    } catch {
      // Left false — /api/health reports the archive as unreachable.
    }

    const mediaStatus = isMediaRootAccessible();

    res.json({
      ok: primaryDbReadable,
      // Settings can repoint a running demo at another archive, and a badge
      // calling real messages "demo data" would be worse than no badge.
      demo: process.env.WACRAWL_DEMO === '1' && paths.primaryDb === resolvePathsFromEnv().primaryDb,
      dbPath: paths.primaryDb,
      paths,
      mediaAccessible: mediaStatus.accessible,
      mediaError: mediaStatus.error ?? null,
    });
  });

  app.use('/api/settings', settingsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api', dataRouter);

  // JSON 404 only for /api routes; non-API routes fall through to static serving below
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
  });

  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA fallback: unmatched non-API GET requests return index.html
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile('index.html', { root: staticDir });
    });
  }

  app.use(errorHandler);

  return app;
}

/** Express 5 passes listen errors, such as a taken port, to the listen callback. */
export function reportListenResult(error?: NodeJS.ErrnoException): void {
  if (!error) {
    console.info(`WaCrawl API listening on http://${HOST}:${PORT}`);
    return;
  }

  console.error(error.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use. WaCrawl may already be running at http://${HOST}:${PORT}. Otherwise, choose another port with PORT=<port>.`
    : `Could not start the WaCrawl API: ${error.message}`);
  process.exitCode = 1;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(PORT, HOST, reportListenResult);
}

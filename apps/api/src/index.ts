import cors from 'cors';
import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import { getDbPath } from './db.js';
import { dataRouter } from './routes/data.js';
import { statsRouter } from './routes/stats.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = '127.0.0.1';
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
const ALLOWED_HOSTS = new Set([
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
]);

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');

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
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS.'));
    },
  }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      dbPath: getDbPath(),
    });
  });

  app.use('/api/stats', statsRouter);
  app.use('/api', dataRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const code = error?.code === 'SQLITE_CANTOPEN' ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR';
    const message = code === 'DATABASE_UNAVAILABLE'
      ? 'Cannot open the WaCrawl database. Check WACRAWL_DB or run wacrawl sync.'
      : 'Unexpected server error.';

    res.status(code === 'DATABASE_UNAVAILABLE' ? 503 : 500).json({
      error: {
        code,
        message,
      },
    });
  };

  app.use(errorHandler);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(PORT, HOST, () => {
    console.info(`WaCrawl API listening on http://${HOST}:${PORT}`);
  });
}

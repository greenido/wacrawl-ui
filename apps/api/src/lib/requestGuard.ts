import type { RequestHandler } from 'express';

/**
 * Most routes are readonly GETs, so CORS hiding the response body is protection
 * enough. Routes that change state (starting an import, rewriting the archive
 * paths) are different: CORS does not stop the request from arriving, and a page
 * on any origin can fire a "simple" cross-origin POST at 127.0.0.1 and never
 * read the reply.
 *
 * Requiring a header the browser does not consider simple forces a preflight,
 * which the origin check in `createApp` rejects for anything but the dashboard.
 */
export const DASHBOARD_REQUEST_HEADER = 'x-wacrawl-request';

export const requireDashboardRequest: RequestHandler = (req, res, next) => {
  if (req.headers[DASHBOARD_REQUEST_HEADER] !== '1') {
    res.status(403).json({
      error: {
        code: 'MISSING_REQUEST_HEADER',
        message: `This request must send ${DASHBOARD_REQUEST_HEADER}: 1.`,
      },
    });
    return;
  }
  next();
};

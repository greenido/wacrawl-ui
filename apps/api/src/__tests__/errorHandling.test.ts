import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../index.js';
import { isClientDisconnect } from '../routes/data.js';

function fakeResponse(headersSent: boolean) {
  const res = {
    headersSent,
    statusCode: 200,
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const req = { method: 'GET', originalUrl: '/api/media/file' } as Request;

describe('isClientDisconnect', () => {
  it('recognizes the codes a browser hangup produces', () => {
    expect(isClientDisconnect('EPIPE')).toBe(true);
    expect(isClientDisconnect('ECONNRESET')).toBe(true);
    expect(isClientDisconnect('ECONNABORTED')).toBe(true);
  });

  it('does not swallow real filesystem failures', () => {
    expect(isClientDisconnect('ENOENT')).toBe(false);
    expect(isClientDisconnect('EACCES')).toBe(false);
    expect(isClientDisconnect('EISDIR')).toBe(false);
    expect(isClientDisconnect(undefined)).toBe(false);
  });
});

describe('errorHandler', () => {
  it('delegates instead of writing once the response is already streaming', () => {
    // A <video> hangup mid-download: sendFile fails with EPIPE after the headers
    // and part of the body are on the wire. Writing JSON here is what threw
    // ERR_HTTP_HEADERS_SENT.
    const res = fakeResponse(true);
    const next = vi.fn() as unknown as NextFunction;
    const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

    errorHandler(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still reports errors raised before anything was sent', () => {
    const res = fakeResponse(false);
    const next = vi.fn() as unknown as NextFunction;

    errorHandler(new Error('boom'), req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' },
    });
  });

  it('maps an unopenable archive to 503', () => {
    const res = fakeResponse(false);
    const next = vi.fn() as unknown as NextFunction;

    errorHandler(Object.assign(new Error('nope'), { code: 'SQLITE_CANTOPEN' }), req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: expect.stringContaining('Cannot open the WaCrawl database'),
      },
    });
  });
});

import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

type RequestWithTiming = Request & { responseDurationMs?: number };

function extractRequestId(
  header: string | string[] | undefined,
): string | undefined {
  if (!header) return undefined;
  if (Array.isArray(header)) {
    return header.length > 0 ? header[0] : undefined;
  }
  return header;
}

export function ensureRequestId(req: Request, res?: Response): string {
  const existing = extractRequestId(req.headers['x-request-id']);
  const requestId = existing && existing.length > 0 ? existing : uuidv4();
  req.requestId = requestId;
  // Attach to generic id field so downstream libs can reuse it.
  (req as Request & { id?: string }).id = requestId;
  if (res) {
    res.setHeader('x-request-id', requestId);
  }
  return requestId;
}

export function requestIdMiddleware(
  req: RequestWithTiming,
  res: Response,
  next: NextFunction,
) {
  ensureRequestId(req, res);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const diff = Number(process.hrtime.bigint() - start) / 1_000_000;
    req.responseDurationMs = Number.isFinite(diff) ? Math.max(diff, 0) : undefined;
  });

  next();
}

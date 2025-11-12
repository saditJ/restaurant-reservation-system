import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

function normalizeRoute(request: Request): string {
  const routePath = request.route?.path ?? '';
  const baseUrl = request.baseUrl ?? '';
  const combined =
    `${baseUrl}${routePath}` ||
    request.path ||
    request.originalUrl ||
    'unknown';
  const normalized = combined.split('?')[0] ?? combined;
  if (normalized === '' || normalized === '/') return '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function createRequestTimingMiddleware(metricsService: MetricsService) {
  return function requestTimingMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (req.path === '/metrics') {
      next();
      return;
    }

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;

      metricsService.observeHttpRequest(
        {
          method: req.method,
          route: normalizeRoute(req),
          statusCode: res.statusCode,
        },
        durationSeconds,
      );
    });

    next();
  };
}

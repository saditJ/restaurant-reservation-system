import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap, map } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';
import { IdempotencyService } from './idempotency.service';

const EXCLUDED_HEADERS = new Set([
  'content-length',
  'date',
  'connection',
  'keep-alive',
  'transfer-encoding',
]);

type RequestMetadata = {
  key: string;
  method: string;
  path: string;
  bodyHash: string;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (!this.shouldHandle(request)) {
      return next.handle();
    }

    const meta = this.buildMetadata(request);
    if (!meta) {
      return next.handle();
    }

    return from(this.idempotency.findEntry(meta.key)).pipe(
      mergeMap((existing) => {
        if (existing) {
          if (
            existing.method !== meta.method ||
            this.stripQuery(existing.path) !== this.stripQuery(meta.path)
          ) {
            this.metrics.incrementIdempotencyConflict();
            return throwError(
              () =>
                new ConflictException({
                  error: {
                    code: 'CONFLICT',
                    message: 'Idempotency key reuse with different route',
                  },
                }),
            );
          }
          if (existing.bodyHash !== meta.bodyHash) {
            this.metrics.incrementIdempotencyConflict();
            return throwError(
              () =>
                new ConflictException({
                  error: {
                    code: 'CONFLICT',
                    message: 'Idempotency key reuse with different payload',
                  },
                }),
            );
          }
          this.applyStoredResponse(
            response,
            existing.status,
            existing.response,
          );
          this.metrics.incrementIdempotencyHit();
          return of(existing.response.body);
        }

        // Acquire lock before processing
        return from(this.idempotency.acquireLock(meta.key)).pipe(
          mergeMap((acquired) => {
            if (!acquired) {
              // Lock not acquired, return 409 conflict (request in progress)
              this.metrics.incrementIdempotencyConflict();
              return throwError(
                () =>
                  new ConflictException({
                    error: {
                      code: 'CONFLICT',
                      message: 'Request already in progress',
                    },
                  }),
              );
            }

            // Lock acquired, process request
            return next.handle().pipe(
              mergeMap((body) =>
                from(this.persistSuccess(response, meta, body)).pipe(
                  mergeMap(() =>
                    from(this.idempotency.releaseLock(meta.key)).pipe(
                      map(() => body),
                    ),
                  ),
                ),
              ),
              catchError((error) =>
                from(this.persistFailure(response, meta, error)).pipe(
                  mergeMap(() =>
                    from(this.idempotency.releaseLock(meta.key)).pipe(
                      mergeMap(() => throwError(() => error)),
                    ),
                  ),
                ),
              ),
            );
          }),
        );
      }),
    );
  }

  private shouldHandle(request: Request): boolean {
    if (!request) return false;
    const method = request.method?.toUpperCase();
    if (!method || !['POST', 'PATCH', 'DELETE'].includes(method)) return false;
    const header =
      request.header('idempotency-key') ??
      request.header('Idempotency-Key') ??
      request.headers['idempotency-key'];
    return !!header;
  }

  private buildMetadata(request: Request): RequestMetadata | null {
    const rawKey =
      request.header('idempotency-key') ?? request.headers['idempotency-key'];
    const key = this.idempotency.normalizeKey(
      typeof rawKey === 'string'
        ? rawKey
        : Array.isArray(rawKey)
          ? rawKey[0]
          : null,
    );
    if (!key) return null;
    const method = (request.method || 'POST').toUpperCase();
    const rawPath =
      (request.baseUrl ?? '') +
      (request.route?.path ?? request.path ?? request.url ?? '');
    const path = this.idempotency.normalizePath(
      this.stripQuery(rawPath || request.originalUrl || request.url),
    );
    const bodyHash = this.idempotency.computeBodyHash(request.body ?? {});
    return { key, method, path, bodyHash };
  }

  private applyStoredResponse(
    response: Response,
    status: number,
    stored: { body: unknown; headers?: Record<string, string> },
  ) {
    response.status(status);
    if (stored.headers) {
      for (const [header, value] of Object.entries(stored.headers)) {
        if (
          value !== undefined &&
          !EXCLUDED_HEADERS.has(header.toLowerCase())
        ) {
          response.setHeader(header, value);
        }
      }
    }
  }

  private async persistSuccess(
    response: Response,
    meta: RequestMetadata,
    body: unknown,
  ) {
    const headers = this.captureHeaders(response);
    await this.idempotency.storeResponse({
      id: meta.key,
      method: meta.method,
      path: meta.path,
      bodyHash: meta.bodyHash,
      status: this.resolveStatusCode(response.statusCode),
      body,
      headers,
    });
  }

  private async persistFailure(
    response: Response,
    meta: RequestMetadata,
    error: unknown,
  ) {
    if (!(error instanceof HttpException)) return;
    const headers = this.captureHeaders(response);
    await this.idempotency.storeResponse({
      id: meta.key,
      method: meta.method,
      path: meta.path,
      bodyHash: meta.bodyHash,
      status: error.getStatus(),
      body: error.getResponse(),
      headers,
    });
  }

  private captureHeaders(response: Response): Record<string, string> {
    const headersRaw = response.getHeaders();
    const entries = Object.entries(headersRaw);
    const headers: Record<string, string> = {};
    for (const [name, value] of entries) {
      if (EXCLUDED_HEADERS.has(name.toLowerCase())) continue;
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        headers[name] = value.map((item) => String(item)).join(', ');
      } else {
        headers[name] = String(value);
      }
    }
    if (!('content-type' in headers)) {
      headers['content-type'] = 'application/json; charset=utf-8';
    }
    return headers;
  }

  private resolveStatusCode(status?: number): number {
    if (!status || status < 100) return 200;
    return status;
  }

  private stripQuery(path?: string | null) {
    if (!path) return '/';
    const idx = path.indexOf('?');
    if (idx === -1) return path;
    return path.slice(0, idx);
  }
}

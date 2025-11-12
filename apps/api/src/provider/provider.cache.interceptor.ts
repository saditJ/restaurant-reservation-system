import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../cache/cache.service';

type CacheAwareRequest = Request & { cacheStatus?: 'hit' | 'miss' };

@Injectable()
export class ProviderUsageCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: CacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<CacheAwareRequest>();
    if (!request || request.method !== 'GET') {
      return next.handle();
    }

    const cacheKey = this.composeCacheKey(request);
    const { value, status } = await this.cache.get<unknown>(cacheKey);
    if (status === 'hit' && value !== null) {
      request.cacheStatus = 'hit';
      return of(value);
    }
    if (status === 'miss') {
      request.cacheStatus = 'miss';
    }

    const shouldCache = status !== 'skipped';
    return next.handle().pipe(
      tap(async (response) => {
        if (!shouldCache) return;
        try {
          await this.cache.set(cacheKey, response, { ttlSeconds: 15 });
        } catch {
          // ignore cache failures for provider dashboards
        }
      }),
    );
  }

  private composeCacheKey(request: Request) {
    const path = request.originalUrl ?? request.url ?? '';
    const tenant = request.header('x-tenant-id') ?? '';
    return `provider:usage:${request.method}:${tenant}:${path}`;
  }
}

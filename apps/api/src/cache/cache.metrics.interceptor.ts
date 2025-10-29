import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize } from 'rxjs';
import type { Observable } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service';

type CacheAwareRequest = Request & { cacheStatus?: 'hit' | 'miss' };

@Injectable()
export class CacheMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<CacheAwareRequest>();
    return next.handle().pipe(
      finalize(() => {
        this.recordMetrics(request);
      }),
    );
  }

  private recordMetrics(request?: CacheAwareRequest) {
    if (!request) return;
    if (request.cacheStatus === 'hit') {
      this.metrics.incrementCacheHit();
    } else if (request.cacheStatus === 'miss') {
      this.metrics.incrementCacheMiss();
    }
    if (request) {
      // Reset so repeated interceptors don't double count.
      // eslint-disable-next-line no-param-reassign
      request.cacheStatus = undefined;
    }
  }
}

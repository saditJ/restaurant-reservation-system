import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { MetricsService } from '../metrics/metrics.service';
import type { AuthenticatedApiKey } from '../auth/api-key.service';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_OPTIONS, RateLimitOptions } from './rate-limit.decorator';
import { RateLimitUsageService } from './rate-limit-usage.service';

type ApiRequest = Request & { apiKey?: AuthenticatedApiKey };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
    private readonly metrics: MetricsService,
    private readonly usage: RateLimitUsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const key = request.apiKey;
    if (!key) return true;

    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_OPTIONS,
      [context.getHandler(), context.getClass()],
    );

    const config = this.limiter.resolveConfig(key, options);
    if (!config) {
      return true;
    }

    const route = this.resolveRoute(request);
    const cost = options?.tokens && options.tokens > 0 ? options.tokens : 1;
    const result = await this.limiter.tryConsume({
      keyId: key.id,
      route,
      cost,
      config,
    });

    if (result.allowed) {
      this.metrics.incrementRateLimitAllow(key.id, route);
      await this.usage.recordAllow(key.id);
      return true;
    }

    this.metrics.incrementRateLimitDrop(key.id, route);
    await this.usage.recordDrop(key.id);
    throw new HttpException({ error: { code: 'RATE_LIMITED' } }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private resolveRoute(request: ApiRequest): string {
    if (request.route?.path) return request.route.path;
    if (request.baseUrl) return request.baseUrl;
    if (request.originalUrl) return request.originalUrl.split('?')[0] ?? request.originalUrl;
    return request.url?.split('?')[0] ?? 'unknown';
  }
}

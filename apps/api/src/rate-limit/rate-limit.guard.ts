import { createHash } from 'node:crypto';

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
import { RateLimitService, type RateLimitConfig } from './rate-limit.service';
import { RATE_LIMIT_OPTIONS, RateLimitOptions } from './rate-limit.decorator';
import { RateLimitUsageService } from './rate-limit-usage.service';

type ApiRequest = Request & {
  apiKey?: AuthenticatedApiKey;
  requestId?: string;
  tenantId?: string;
  apiKeyId?: string;
  actor?: {
    kind: 'service' | 'staff' | 'guest';
    userId?: string;
    roles?: string[];
  };
};

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
    const response = context.switchToHttp().getResponse();
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_OPTIONS, [context.getHandler(), context.getClass()]);

    const route = this.resolveRoute(request);
    const cost = options?.tokens && options.tokens > 0 ? options.tokens : 1;
    const key = request.apiKey;

    if (!key) {
      if (!options) return true;
      return this.applyGuestRateLimit({
        request,
        response,
        options,
        route,
        cost,
      });
    }

    const config = this.limiter.resolveConfig(key, options);
    if (!config) {
      return true;
    }

    // Check rate limit (RPS + burst)
    const result = await this.limiter.tryConsume({
      keyId: key.id,
      route,
      cost,
      config,
    });

    if (!result.allowed) {
      this.metrics.incrementRateLimitDrop(key.id, route);
      await this.usage.recordDrop(key.id, cost);

      // Set rate limit headers
      response.setHeader(
        'X-RateLimit-Remaining',
        Math.max(result.remaining, 0),
      );
      response.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(Date.now() / 1000) + 60,
      );

      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check monthly quota
    try {
      await this.usage.trackUsage(key.id, cost);
      this.metrics.incrementRateLimitAllow(key.id, route);
      await this.usage.recordAllow(key.id, cost);

      // Add quota headers
      const quotaInfo = await this.usage.getUsage(key.id);
      response.setHeader(
        'X-Quota-Remaining',
        Math.max(quotaInfo.limit - quotaInfo.used, 0),
      );
      response.setHeader('X-Quota-Limit', quotaInfo.limit);

      return true;
    } catch (error) {
      if ((error as Error).message === 'QUOTA_EXCEEDED') {
        const quotaInfo = await this.usage.getUsage(key.id);
        response.setHeader('X-Quota-Remaining', 0);
        response.setHeader('X-Quota-Limit', quotaInfo.limit);
        response.setHeader('X-Quota-Reset', quotaInfo.resetDate);

        throw new HttpException(
          {
            error: {
              code: 'QUOTA_EXCEEDED',
              message: 'Monthly quota exceeded',
              details: {
                used: quotaInfo.used,
                limit: quotaInfo.limit,
                resetDate: quotaInfo.resetDate,
              },
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
  }

  private resolveRoute(request: ApiRequest): string {
    if (request.route?.path) return request.route.path;
    if (request.baseUrl) return request.baseUrl;
    if (request.originalUrl)
      return request.originalUrl.split('?')[0] ?? request.originalUrl;
    return request.url?.split('?')[0] ?? 'unknown';
  }

  private async applyGuestRateLimit(params: {
    request: ApiRequest;
    response: any;
    options: RateLimitOptions;
    route: string;
    cost: number;
  }): Promise<boolean> {
    const keyId = this.resolveGuestKey(params.request);
    if (!keyId) return true;
    const config = this.buildGuestConfig(params.options);
    const result = await this.limiter.tryConsume({
      keyId,
      route: params.route,
      cost: params.cost,
      config,
    });

    params.response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(result.remaining, 0),
    );
    params.response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(Date.now() / 1000) + 60,
    );

    if (!result.allowed) {
      this.metrics.incrementRateLimitDrop(keyId, params.route);
      params.response.setHeader('Retry-After', '60');
      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.metrics.incrementRateLimitAllow(keyId, params.route);
    return true;
  }

  private resolveGuestKey(request: ApiRequest): string | null {
    const ip = this.extractClientIp(request);
    if (!ip) return null;
    const hashed = createHash('sha256').update(ip).digest('hex');
    return `guest:${hashed}`;
  }

  private extractClientIp(request: ApiRequest): string | null {
    const forwarded = request.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() || null;
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0]?.trim() || null;
    }
    if (typeof request.ip === 'string' && request.ip.trim()) {
      return request.ip.trim();
    }
    const socketIp = request.socket?.remoteAddress;
    if (typeof socketIp === 'string' && socketIp.trim()) {
      return socketIp.trim();
    }
    return null;
  }

  private buildGuestConfig(options: RateLimitOptions): RateLimitConfig {
    const perMinute = this.sanitizeRate(
      options.requestsPerMinute !== undefined ? options.requestsPerMinute : 30,
    );
    const burst = this.sanitizeBurst(
      options.burstLimit !== undefined ? options.burstLimit : perMinute * 2,
      perMinute,
    );
    return {
      requestsPerMinute: perMinute,
      burstLimit: burst,
    };
  }

  private sanitizeRate(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 30;
    }
    return Math.min(Math.floor(numeric), 50_000);
  }

  private sanitizeBurst(value: number | undefined, rate: number): number {
    if (!Number.isFinite(value ?? NaN) || (value ?? 0) <= 0) {
      return Math.max(rate, 1);
    }
    return Math.max(Math.floor(value as number), Math.max(rate, 1));
  }
}

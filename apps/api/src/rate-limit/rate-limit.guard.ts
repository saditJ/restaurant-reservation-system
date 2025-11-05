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

    // Check rate limit (RPS + burst)
    const result = await this.limiter.tryConsume({
      keyId: key.id,
      route,
      cost,
      config,
    });

    if (!result.allowed) {
      this.metrics.incrementRateLimitDrop(key.id, route);
      await this.usage.recordDrop(key.id);
      
      // Set rate limit headers
      response.setHeader('X-RateLimit-Remaining', Math.max(result.remaining, 0));
      response.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);
      
      throw new HttpException(
        { 
          error: { 
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
          } 
        }, 
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Check monthly quota
    try {
      await this.usage.trackUsage(key.id, cost);
      this.metrics.incrementRateLimitAllow(key.id, route);
      await this.usage.recordAllow(key.id);

      // Add quota headers
      const quotaInfo = await this.usage.getUsage(key.id);
      response.setHeader('X-Quota-Remaining', Math.max(quotaInfo.limit - quotaInfo.used, 0));
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
            } 
          }, 
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw error;
    }
  }

  private resolveRoute(request: ApiRequest): string {
    if (request.route?.path) return request.route.path;
    if (request.baseUrl) return request.baseUrl;
    if (request.originalUrl) return request.originalUrl.split('?')[0] ?? request.originalUrl;
    return request.url?.split('?')[0] ?? 'unknown';
  }
}

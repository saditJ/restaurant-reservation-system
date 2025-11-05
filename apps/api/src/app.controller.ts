import { Controller, Get, Req, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';
import { Public } from './common/decorators/public.decorator';
import { Tenant } from './common/decorators/tenant.decorator';
import { Roles } from './common/decorators/roles.decorator';
import { RateLimitUsageService } from './rate-limit/rate-limit-usage.service';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitUsage: RateLimitUsageService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'api', port: 3003 }; // PATCH 20b
  }

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        dependencies: {
          database: 'ok',
        },
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database connection failed',
        details: {
          database: 'fail',
        },
      });
    }
  }

  @Get('whoami')
  whoami(@Tenant() tenantId?: string) {
    return { tenantId };
  }

  @Roles('owner', 'manager')
  @Get('secure/admin-ping')
  adminPing() {
    return { ok: true }; // PATCH 20b
  }

  @Roles('owner')
  @Get('v1/admin/limits')
  async getLimits(@Req() req: Request & { apiKeyId?: string }) {
    const apiKeyId = req.apiKeyId;
    if (!apiKeyId) {
      return { 
        error: 'API key not found in request',
      };
    }

    const quotaInfo = await this.rateLimitUsage.getUsage(apiKeyId);
    return {
      apiKeyId,
      quota: {
        used: quotaInfo.used,
        limit: quotaInfo.limit,
        remaining: Math.max(quotaInfo.limit - quotaInfo.used, 0),
        resetDate: quotaInfo.resetDate,
      },
    };
  }
}

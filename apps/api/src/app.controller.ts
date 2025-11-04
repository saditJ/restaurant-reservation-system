import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Public } from './common/decorators/public.decorator';
import { Tenant } from './common/decorators/tenant.decorator';
import { Roles } from './common/decorators/roles.decorator';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

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
}

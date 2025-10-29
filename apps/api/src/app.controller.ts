import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

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
}

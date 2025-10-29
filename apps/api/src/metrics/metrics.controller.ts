import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma.service';

@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('metrics')
  async getMetrics(@Res({ passthrough: true }) res: Response) {
    await this.metricsService.updateNotificationMetrics(this.prisma);
    res.setHeader('Content-Type', this.metricsService.getContentType());
    return this.metricsService.getMetrics();
  }
}

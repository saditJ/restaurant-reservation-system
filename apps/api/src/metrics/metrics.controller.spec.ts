import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let service: MetricsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const prismaMock = {
      $transaction: jest.fn().mockResolvedValue([0, 0, 0, [], 0, 0, []]),
      notificationOutbox: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    controller = module.get(MetricsController);
    service = module.get(MetricsService);
    prisma = module.get(PrismaService);
  });

  it('returns metrics with prometheus content type', async () => {
    const res = {
      setHeader: jest.fn(),
    } as unknown as Response;

    service.onModuleInit();
    const result = await controller.getMetrics(res);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      service.getContentType(),
    );
    expect(result).toEqual(
      expect.stringContaining('http_request_duration_seconds'),
    );
  });
});

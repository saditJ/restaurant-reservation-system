import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma.service';
import { RateLimitUsageService } from './rate-limit/rate-limit-usage.service';

describe('AppController', () => {
  let appController: AppController;
  const prismaMock = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    prismaMock.$queryRaw.mockResolvedValue([1]);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: RateLimitUsageService,
          useValue: {
            getUsage: jest.fn().mockResolvedValue({
              used: 0,
              limit: 100,
              resetDate: new Date().toISOString(),
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health endpoints', () => {
    it('should report health ok', () => {
      expect(appController.health()).toEqual({
        ok: true,
        service: 'api',
        port: 3003,
      });
    });

    it('should report liveness ok', () => {
      expect(appController.live()).toEqual({ status: 'ok' });
    });

    it('should report readiness ok when database resolves', async () => {
      await expect(appController.ready()).resolves.toEqual({
        status: 'ok',
        dependencies: { database: 'ok' },
      });
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
    });

    it('should throw when database check fails', async () => {
      prismaMock.$queryRaw.mockRejectedValueOnce(new Error('no db'));
      await expect(appController.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});

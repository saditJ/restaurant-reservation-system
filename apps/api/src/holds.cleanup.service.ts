import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HoldStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const SWEEP_BATCH_SIZE = 50;

@Injectable()
export class HoldsCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private sweepInFlight: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HoldsCleanupService.name);
  }

  async onModuleInit() {
    await this.safeSweep('bootstrap');
    this.timer = setInterval(() => {
      void this.safeSweep('interval');
    }, this.intervalMs());
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private intervalMs(): number {
    const raw = Number(process.env.HOLDS_SWEEP_INTERVAL_MS);
    if (Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }
    return DEFAULT_SWEEP_INTERVAL_MS;
  }

  private async safeSweep(reason: 'bootstrap' | 'interval') {
    if (this.sweepInFlight) {
      return this.sweepInFlight;
    }
    this.sweepInFlight = this.sweep(reason)
      .catch((error) => {
        this.logger.error(
          {
            err: error instanceof Error ? error : undefined,
            reason,
          },
          'Failed to sweep expired holds',
        );
      })
      .finally(() => {
        this.sweepInFlight = null;
      });
    return this.sweepInFlight;
  }

  private async sweep(reason: 'bootstrap' | 'interval') {
    const started = Date.now();
    let totalExpired = 0;
    let batches = 0;

    while (true) {
      const result = await this.prisma.$transaction(async (tx) => {
        const expired = await tx.hold.findMany({
          where: {
            status: HoldStatus.HELD,
            expiresAt: { lt: new Date() },
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: SWEEP_BATCH_SIZE,
        });

        if (expired.length === 0) {
          return 0;
        }

        await tx.hold.updateMany({
          where: { id: { in: expired.map((hold) => hold.id) } },
          data: { status: HoldStatus.EXPIRED },
        });

        return expired.length;
      });

      if (result === 0) {
        break;
      }

      totalExpired += result;
      batches += 1;
    }

    const durationMs = Date.now() - started;
    const requestId = this.resolveRequestId();
    this.logger.info(
      {
        event: 'holds_sweep',
        reason,
        expired: totalExpired,
        batches,
        duration_ms: durationMs,
        ...(requestId ? { request_id: requestId } : {}),
      },
      totalExpired > 0
        ? `Expired ${totalExpired} holds in ${batches} batches`
        : 'No holds expired',
    );
  }

  private resolveRequestId(): string | undefined {
    return undefined;
  }
}

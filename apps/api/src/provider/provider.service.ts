import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma.service';
import { RateLimitUsageService } from '../rate-limit/rate-limit-usage.service';

type DateRange = { from: Date; to: Date };

type ProviderKeyUsageItem = {
  apiKeyId: string;
  monthlyCap: number;
  usedThisMonth: number;
  rps: number;
  burst: number;
};

type ProviderKeyTimeseriesPoint = {
  date: string;
  count: number;
};

type TenantUsage = {
  tenantId: string;
  totalRequests: number;
  totalReservations: number;
};

@Injectable()
export class ProviderUsageService {
  private readonly logger = new Logger(ProviderUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly rateUsage: RateLimitUsageService,
  ) {}

  async listApiKeyUsage(params: {
    tenantId?: string;
    from?: string;
    to?: string;
  }): Promise<{ items: ProviderKeyUsageItem[]; total: number }> {
    const range = this.resolveMonthlyRange(params.from, params.to);
    const keys = await this.prisma.apiKey.findMany({
      where: params.tenantId ? { tenantId: params.tenantId } : undefined,
      orderBy: [{ createdAt: 'asc' }],
    });
    if (keys.length === 0) {
      return { items: [], total: 0 };
    }

    const redisAvailable = this.cache.isReady();
    const items = await Promise.all(
      keys.map(async (key): Promise<ProviderKeyUsageItem> => {
        const quota = await this.rateUsage.getUsage(key.id);
        let used = quota.used;
        if (!redisAvailable) {
          used = await this.countAuditUsageForKey(key.id, range.from, range.to);
        }
        return {
          apiKeyId: key.id,
          monthlyCap: quota.limit,
          usedThisMonth: used,
          rps: Number((key.rateLimitPerMin / 60).toFixed(2)),
          burst: key.burstLimit,
        };
      }),
    );

    return {
      items,
      total: items.length,
    };
  }

  async getKeyTimeseries(
    apiKeyId: string,
    days: number,
  ): Promise<{ points: ProviderKeyTimeseriesPoint[]; sum: number }> {
    const clampedDays = Math.min(Math.max(days, 1), 365);
    const daysList = this.enumerateDays(clampedDays);
    const redis = this.cache.isReady() ? this.cache.getClient() : null;

    if (redis) {
      const redisKeys = daysList.map(
        (entry) => `usage:${apiKeyId}:${entry.redisKey}`,
      );
      const values = await redis.mget(redisKeys);
      const points = daysList.map((entry, index) => ({
        date: entry.isoDate,
        count: parseInt(values?.[index] ?? '0', 10) || 0,
      }));
      const sum = points.reduce((acc, point) => acc + point.count, 0);
      await this.backfillMissingUsageKeys(redis, redisKeys, values);
      return { points, sum };
    }

    const from = daysList[0].start;
    const to = daysList[daysList.length - 1].end;
    const logs = await this.prisma.auditLog.findMany({
      where: {
        actor: `api-key:${apiKeyId}`,
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      select: { createdAt: true },
    });

    const counts = new Map<string, number>();
    for (const entry of daysList) {
      counts.set(entry.isoDate, 0);
    }
    for (const log of logs) {
      const iso = this.formatIsoDate(log.createdAt);
      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    }
    const points = daysList.map((entry) => ({
      date: entry.isoDate,
      count: counts.get(entry.isoDate) ?? 0,
    }));
    const sum = points.reduce((acc, point) => acc + point.count, 0);
    return { points, sum };
  }

  async listTenantUsage(params: {
    from?: string;
    to?: string;
  }): Promise<{ items: TenantUsage[]; total: number }> {
    const range = this.resolveRange(params.from, params.to, 30);
    const keys = await this.prisma.apiKey.findMany({
      select: {
        id: true,
        tenantId: true,
      },
    });
    const tenantStats = new Map<string, TenantUsage>();
    for (const key of keys) {
      if (!tenantStats.has(key.tenantId)) {
        tenantStats.set(key.tenantId, {
          tenantId: key.tenantId,
          totalRequests: 0,
          totalReservations: 0,
        });
      }
    }

    const dayEntries = this.enumerateDaysForRange(range);
    const redis = this.cache.isReady() ? this.cache.getClient() : null;

    if (redis) {
      await Promise.all(
        keys.map(async (key) => {
          const usageKeys = dayEntries.map(
            (entry) => `usage:${key.id}:${entry.redisKey}`,
          );
          const values = await redis.mget(usageKeys);
          await this.backfillMissingUsageKeys(redis, usageKeys, values);
          const total = values.reduce(
            (acc, value) => acc + (parseInt(value ?? '0', 10) || 0),
            0,
          );
          const stats = tenantStats.get(key.tenantId);
          if (stats) {
            stats.totalRequests += total;
          }
        }),
      );
    } else {
      const auditCounts = await this.prisma.auditLog.groupBy({
        by: ['actor'],
        _count: { _all: true },
        where: {
          actor: {
            startsWith: 'api-key:',
          },
          createdAt: {
            gte: range.from,
            lte: range.to,
          },
        },
      });
      for (const entry of auditCounts) {
        const keyId = entry.actor.replace('api-key:', '');
        const key = keys.find((item) => item.id === keyId);
        if (!key) continue;
        const stats = tenantStats.get(key.tenantId);
        if (stats) {
          stats.totalRequests += entry._count._all;
        }
      }
    }

    await this.populateReservationCounts(range, tenantStats);

    const items = Array.from(tenantStats.values()).sort((a, b) => {
      if (b.totalRequests !== a.totalRequests) {
        return b.totalRequests - a.totalRequests;
      }
      return b.totalReservations - a.totalReservations;
    });

    return {
      items,
      total: items.length,
    };
  }

  private resolveMonthlyRange(from?: string, to?: string): DateRange {
    const end = this.parseDate(to) ?? new Date();
    const endOfDay = this.endOfDay(end);
    const monthStart = new Date(
      Date.UTC(endOfDay.getUTCFullYear(), endOfDay.getUTCMonth(), 1),
    );
    const startCandidate = this.parseDate(from);
    const start =
      startCandidate && startCandidate < endOfDay
        ? this.startOfDay(startCandidate)
        : monthStart;
    if (start > endOfDay) {
      return { from: monthStart, to: endOfDay };
    }
    return { from: start, to: endOfDay };
  }

  private resolveRange(
    from?: string,
    to?: string,
    defaultDays = 30,
  ): DateRange {
    const end = this.parseDate(to) ?? new Date();
    let toDate = this.endOfDay(end);
    let fromDate: Date;
    if (from) {
      const parsed = this.parseDate(from);
      fromDate = parsed
        ? this.startOfDay(parsed)
        : this.subtractDays(toDate, defaultDays - 1);
    } else {
      fromDate = this.subtractDays(toDate, defaultDays - 1);
    }
    if (fromDate > toDate) {
      [fromDate, toDate] = [toDate, fromDate];
    }
    return { from: fromDate, to: toDate };
  }

  private enumerateDays(days: number) {
    const entries: {
      isoDate: string;
      redisKey: string;
      start: Date;
      end: Date;
    }[] = [];
    const today = this.startOfDay(new Date());
    for (let i = days - 1; i >= 0; i -= 1) {
      const start = this.subtractDays(today, i);
      const end = this.endOfDay(start);
      entries.push({
        isoDate: this.formatIsoDate(start),
        redisKey: this.formatRedisDay(start),
        start,
        end,
      });
    }
    return entries;
  }

  private enumerateDaysForRange(range: DateRange) {
    const entries: { redisKey: string }[] = [];
    const days = Math.max(
      1,
      Math.round(
        (range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    );
    const start = this.startOfDay(range.from);
    for (let i = 0; i < days; i += 1) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      entries.push({ redisKey: this.formatRedisDay(date) });
    }
    return entries;
  }

  private subtractDays(date: Date, days: number) {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() - days);
    return this.startOfDay(result);
  }

  private startOfDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }

  private endOfDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return undefined;
    return new Date(timestamp);
  }

  private formatRedisDay(date: Date) {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private formatIsoDate(date: Date | string) {
    const instance = typeof date === 'string' ? new Date(date) : date;
    const year = instance.getUTCFullYear();
    const month = `${instance.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${instance.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async countAuditUsageForKey(
    apiKeyId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.auditLog.count({
      where: {
        actor: `api-key:${apiKeyId}`,
        createdAt: {
          gte: from,
          lte: to,
        },
      },
    });
  }

  private async populateReservationCounts(
    range: DateRange,
    tenantStats: Map<string, TenantUsage>,
  ) {
    if (tenantStats.size === 0) return;
    const tenantIds = Array.from(tenantStats.keys());
    const createdFilter: Prisma.DateTimeFilter = {};
    if (range.from) createdFilter.gte = range.from;
    if (range.to) createdFilter.lte = range.to;

    const reservations = await this.prisma.reservation.groupBy({
      by: ['venueId'],
      _count: { _all: true },
      where: {
        ...(range.from || range.to ? { createdAt: createdFilter } : {}),
        venue: {
          tenantId: { in: tenantIds },
        },
      },
    });
    if (reservations.length === 0) return;

    const venueIds = reservations.map((item) => item.venueId);
    const venues = await this.prisma.venue.findMany({
      where: { id: { in: venueIds } },
      select: { id: true, tenantId: true },
    });
    const venueTenant = new Map<string, string>();
    for (const venue of venues) {
      venueTenant.set(venue.id, venue.tenantId);
      if (!tenantStats.has(venue.tenantId)) {
        tenantStats.set(venue.tenantId, {
          tenantId: venue.tenantId,
          totalRequests: 0,
          totalReservations: 0,
        });
      }
    }

    for (const entry of reservations) {
      const tenantId = venueTenant.get(entry.venueId);
      if (!tenantId) continue;
      const stats = tenantStats.get(tenantId);
      if (stats) {
        stats.totalReservations += entry._count._all;
      }
    }
  }

  private async backfillMissingUsageKeys(
    redis: Redis,
    keys: string[],
    values: (string | null | undefined)[] | null,
  ) {
    if (!values) return;
    const entriesToSeed: string[] = [];
    values.forEach((value, index) => {
      if (value === null || value === undefined) {
        entriesToSeed.push(keys[index]);
      }
    });
    if (!entriesToSeed.length) return;
    const ttlSeconds = 45 * 24 * 60 * 60;
    try {
      const pipeline = redis.multi();
      for (const key of entriesToSeed) {
        pipeline.set(key, '0', 'EX', ttlSeconds);
      }
      await pipeline.exec();
    } catch (error) {
      this.logger.debug(
        `Failed to backfill usage keys (${entriesToSeed.length}): ${(error as Error).message}`,
      );
    }
  }
}

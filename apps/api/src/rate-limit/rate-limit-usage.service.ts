import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { CacheService } from '../cache/cache.service';

type UsageSummary = {
  allows24h: number;
  drops24h: number;
};

const BUCKET_MS = 60 * 60 * 1000; // hourly buckets
const BUCKET_TTL_MS = 26 * 60 * 60 * 1000; // keep a bit beyond 24h

@Injectable()
export class RateLimitUsageService {
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, Map<string, MemoryBucket>>();

  constructor(cache: CacheService) {
    this.redis = cache.getClient();
  }

  async recordAllow(keyId: string): Promise<void> {
    if (this.redis) {
      await this.incrementRedis('allow', keyId);
      return;
    }
    this.incrementMemory('allow', keyId);
  }

  async recordDrop(keyId: string): Promise<void> {
    if (this.redis) {
      await this.incrementRedis('drop', keyId);
      return;
    }
    this.incrementMemory('drop', keyId);
  }

  async getUsageSummary(keyIds: string[]): Promise<Record<string, UsageSummary>> {
    if (keyIds.length === 0) return {};
    if (this.redis) {
      return this.fetchFromRedis(keyIds);
    }
    return this.fetchFromMemory(keyIds);
  }

  private async incrementRedis(kind: 'allow' | 'drop', keyId: string) {
    const bucket = this.currentBucket();
    const redisKey = this.composeRedisKey(kind, keyId, bucket);
    const client = this.redis!;
    await client
      .multi()
      .incrby(redisKey, 1)
      .pexpire(redisKey, BUCKET_TTL_MS)
      .exec();
  }

  private incrementMemory(kind: 'allow' | 'drop', keyId: string) {
    const bucket = this.currentBucket();
    const now = Date.now();
    if (!this.memory.has(keyId)) {
      this.memory.set(keyId, new Map());
    }
    const buckets = this.memory.get(keyId)!;
    const entry = buckets.get(bucket) ?? { allows: 0, drops: 0, expiresAt: now + BUCKET_TTL_MS };
    if (kind === 'allow') {
      entry.allows += 1;
    } else {
      entry.drops += 1;
    }
    entry.expiresAt = now + BUCKET_TTL_MS;
    buckets.set(bucket, entry);
    this.pruneMemory(buckets, now);
  }

  private async fetchFromRedis(keyIds: string[]): Promise<Record<string, UsageSummary>> {
    const buckets = this.lastBuckets(24);
    const client = this.redis!;
    const pipeline = client.multi();

    for (const keyId of keyIds) {
      for (const bucket of buckets) {
        pipeline.get(this.composeRedisKey('allow', keyId, bucket));
        pipeline.get(this.composeRedisKey('drop', keyId, bucket));
      }
    }

    const results = await pipeline.exec();
    const summary: Record<string, UsageSummary> = {};

    let index = 0;
    for (const keyId of keyIds) {
      let allows = 0;
      let drops = 0;
      for (let i = 0; i < buckets.length; i += 1) {
        const allowResponse = results?.[index]?.[1];
        const dropResponse = results?.[index + 1]?.[1];
        allows += parseRedisInt(allowResponse);
        drops += parseRedisInt(dropResponse);
        index += 2;
      }
      summary[keyId] = { allows24h: allows, drops24h: drops };
    }

    return summary;
  }

  private fetchFromMemory(keyIds: string[]): Record<string, UsageSummary> {
    const now = Date.now();
    const boundary = now - 24 * 60 * 60 * 1000;
    const summary: Record<string, UsageSummary> = {};
    for (const keyId of keyIds) {
      const buckets = this.memory.get(keyId);
      if (!buckets) {
        summary[keyId] = { allows24h: 0, drops24h: 0 };
        continue;
      }
      let allows = 0;
      let drops = 0;
      for (const [bucket, entry] of buckets) {
        if (parseBucket(bucket) >= boundary) {
          allows += entry.allows;
          drops += entry.drops;
        }
      }
      summary[keyId] = { allows24h: allows, drops24h: drops };
      this.pruneMemory(buckets, now);
    }
    return summary;
  }

  private composeRedisKey(kind: 'allow' | 'drop', keyId: string, bucket: string) {
    return `rl:${kind}:${keyId}:${bucket}`;
  }

  private currentBucket() {
    return this.formatBucket(Date.now());
  }

  private lastBuckets(count: number): string[] {
    const now = Date.now();
    const buckets: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const instant = now - i * BUCKET_MS;
      buckets.push(this.formatBucket(instant));
    }
    return buckets;
  }

  private formatBucket(timestamp: number) {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    const hour = `${date.getUTCHours()}`.padStart(2, '0');
    return `${year}${month}${day}${hour}`;
  }

  private pruneMemory(map: Map<string, MemoryBucket>, now: number) {
    for (const [bucket, entry] of map) {
      if (entry.expiresAt <= now) {
        map.delete(bucket);
      }
    }
  }
}

type MemoryBucket = {
  allows: number;
  drops: number;
  expiresAt: number;
};

function parseRedisInt(value: unknown): number {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

function parseBucket(bucket: string): number {
  const year = Number(bucket.slice(0, 4));
  const month = Number(bucket.slice(4, 6));
  const day = Number(bucket.slice(6, 8));
  const hour = Number(bucket.slice(8, 10));
  const date = Date.UTC(year, month - 1, day, hour);
  return Number.isFinite(date) ? date : 0;
}

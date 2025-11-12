import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { CacheService } from '../cache/cache.service';
import type { AuthenticatedApiKey } from '../auth/api-key.service';
import type { RateLimitOptions } from './rate-limit.decorator';

type TokenBucketResult = {
  allowed: boolean;
  remaining: number;
};

type ConsumeParams = {
  keyId: string;
  route: string;
  cost: number;
  config: RateLimitConfig;
};

export type RateLimitConfig = {
  requestsPerMinute: number;
  burstLimit: number;
};

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis | null;
  private readonly redisStore: RedisTokenBucketStore | null;
  private readonly memoryStore = new MemoryTokenBucketStore();

  constructor(cache: CacheService) {
    this.redis = cache.getClient();
    this.redisStore = this.redis ? new RedisTokenBucketStore(this.redis) : null;
  }

  resolveConfig(
    key: AuthenticatedApiKey,
    override?: RateLimitOptions,
  ): RateLimitConfig | null {
    const perMinute = sanitizeRate(
      override?.requestsPerMinute !== undefined
        ? override.requestsPerMinute
        : key.rateLimitPerMin,
    );
    if (perMinute <= 0) return null;
    const burst = sanitizeBurst(
      override?.burstLimit !== undefined ? override.burstLimit : key.burstLimit,
      perMinute,
    );
    return {
      requestsPerMinute: perMinute,
      burstLimit: burst,
    };
  }

  async tryConsume(params: ConsumeParams): Promise<TokenBucketResult> {
    const { keyId, route, cost, config } = params;
    if (config.requestsPerMinute <= 0) {
      return { allowed: true, remaining: config.burstLimit };
    }

    const bucketKey = this.composeBucketKey(keyId, route);
    const allowCost = cost > 0 ? cost : 1;
    const now = Date.now();
    const refillPerMs = config.requestsPerMinute / 60_000;

    try {
      if (this.redisStore) {
        return await this.redisStore.tryConsume({
          bucketKey,
          capacity: config.burstLimit,
          refillPerMs,
          cost: allowCost,
          now,
        });
      }
      return this.memoryStore.tryConsume({
        bucketKey,
        capacity: config.burstLimit,
        refillPerMs,
        cost: allowCost,
        now,
      });
    } catch (error) {
      this.logger.warn(
        `Rate limiter failure for ${bucketKey}: ${(error as Error).message}`,
      );
      return this.memoryStore.tryConsume({
        bucketKey,
        capacity: config.burstLimit,
        refillPerMs,
        cost: allowCost,
        now,
      });
    }
  }

  private composeBucketKey(keyId: string, route: string) {
    const normalizedRoute = route.replace(/\s+/g, '').toLowerCase();
    return `rate:${keyId}:${normalizedRoute}`;
  }
}

type TokenBucketConsumeArgs = {
  bucketKey: string;
  capacity: number;
  refillPerMs: number;
  cost: number;
  now: number;
};

class MemoryTokenBucketStore {
  private readonly buckets = new Map<
    string,
    { tokens: number; updatedAt: number }
  >();
  private readonly ttlMs = 10 * 60 * 1000;

  tryConsume(args: TokenBucketConsumeArgs): TokenBucketResult {
    const { bucketKey, capacity, refillPerMs, cost, now } = args;
    const state = this.buckets.get(bucketKey);
    let tokens = state ? state.tokens : capacity;
    let updatedAt = state ? state.updatedAt : now;

    if (now > updatedAt) {
      const delta = now - updatedAt;
      tokens = Math.min(capacity, tokens + delta * refillPerMs);
      updatedAt = now;
    }

    let allowed = true;
    if (tokens < cost) {
      allowed = false;
    } else {
      tokens -= cost;
    }

    if (allowed || state) {
      this.buckets.set(bucketKey, { tokens, updatedAt: now });
    }

    this.evictExpired(now);

    return {
      allowed,
      remaining: Math.max(tokens, 0),
    };
  }

  private evictExpired(now: number) {
    if (this.buckets.size === 0) return;
    for (const [key, value] of this.buckets) {
      if (now - value.updatedAt > this.ttlMs) {
        this.buckets.delete(key);
      }
    }
  }
}

class RedisTokenBucketStore {
  private readonly script = `
    local bucket_key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_per_ms = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])
    local ttl = tonumber(ARGV[5])

    local state = redis.call('HMGET', bucket_key, 'tokens', 'timestamp')
    local tokens = tonumber(state[1])
    local last = tonumber(state[2])

    if tokens == nil then
      tokens = capacity
    end
    if last == nil then
      last = now
    end

    if now > last then
      local delta = now - last
      local refill = delta * refill_per_ms
      tokens = math.min(capacity, tokens + refill)
      last = now
    end

    if tokens < cost then
      redis.call('HMSET', bucket_key, 'tokens', tokens, 'timestamp', last)
      redis.call('PEXPIRE', bucket_key, ttl)
      return {0, tokens}
    end

    tokens = tokens - cost
    redis.call('HMSET', bucket_key, 'tokens', tokens, 'timestamp', last)
    redis.call('PEXPIRE', bucket_key, ttl)
    return {1, tokens}
  `;

  private readonly ttlMs = 120_000;

  constructor(private readonly redis: Redis) {}

  async tryConsume(args: TokenBucketConsumeArgs): Promise<TokenBucketResult> {
    const { bucketKey, capacity, refillPerMs, cost, now } = args;
    const result = await this.redis.eval(
      this.script,
      1,
      bucketKey,
      capacity,
      refillPerMs,
      now,
      cost,
      this.ttlMs,
    );

    if (Array.isArray(result) && result.length >= 2) {
      const allowed = Number(result[0]) === 1;
      const remaining = Number(result[1]) ?? 0;
      return { allowed, remaining };
    }

    const allowed = Number(result) === 1;
    return { allowed, remaining: allowed ? capacity - cost : 0 };
  }
}

function sanitizeRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(Math.floor(rate), 50_000);
}

function sanitizeBurst(burst: number | undefined, rate: number): number {
  if (!Number.isFinite(burst ?? NaN) || (burst ?? 0) <= 0) {
    return Math.max(rate, 1);
  }
  return Math.max(Math.floor(burst as number), Math.max(rate, 1));
}

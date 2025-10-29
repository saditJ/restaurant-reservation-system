import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

type CacheStatus = 'hit' | 'miss' | 'skipped';

export type CacheGetResult<T> = {
  value: T | null;
  status: CacheStatus;
};

export type CacheSetOptions = {
  ttlSeconds?: number;
};

type MultiSetEntry = {
  key: string;
  value: unknown;
  ttlSeconds?: number;
};

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly url: string;
  private client: Redis | null = null;
  private enabled = false;

  constructor() {
    this.url = process.env.REDIS_URL?.trim() || 'redis://localhost:6379/0';
    try {
      this.client = new Redis(this.url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      });
      this.client.on('error', (error: Error) => {
        this.logger.warn(`Redis connection issue: ${error.message}`);
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis client', error as Error);
      this.client = null;
    }
  }

  async onModuleInit() {
    if (!this.client) {
      return;
    }
    try {
      await this.client.connect();
      await this.client.ping();
      this.enabled = true;
      this.logger.log(`Connected to Redis at ${this.url}`);
    } catch (error) {
      this.logger.error('Unable to connect to Redis, disabling cache', error as Error);
      try {
        await this.client.quit();
      } catch (quitError) {
        this.logger.warn(`Failed to close Redis client after init error: ${(quitError as Error).message}`);
      }
      this.client = null;
      this.enabled = false;
    }
  }

  async onModuleDestroy() {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(`Error while shutting down Redis client: ${(error as Error).message}`);
    }
  }

  isReady() {
    return this.enabled && this.client !== null;
  }

  getClient(): Redis | null {
    if (!this.enabled || !this.client) {
      return null;
    }
    return this.client;
  }

  buildAvailabilityKey(venueId: string, date: string, partySize: number, policyHash: string) {
    const safeVenue = venueId || 'unknown';
    const safeDate = date || 'unknown';
    return `avail:${safeVenue}:${safeDate}:${partySize}:${policyHash}`;
  }

  availabilityPrefix(venueId: string, date: string) {
    const safeVenue = venueId || 'unknown';
    const safeDate = date || 'unknown';
    return `avail:${safeVenue}:${safeDate}:`;
  }

  async get<T = unknown>(key: string): Promise<CacheGetResult<T>> {
    if (!this.client || !this.enabled) {
      return { value: null, status: 'skipped' };
    }
    try {
      const raw = await this.client.get(key);
      if (raw === null) {
        return { value: null, status: 'miss' };
      }
      return { value: JSON.parse(raw) as T, status: 'hit' };
    } catch (error) {
      this.logger.warn(`Cache get failed for key "${key}": ${(error as Error).message}`);
      return { value: null, status: 'skipped' };
    }
  }

  async set(key: string, value: unknown, options: CacheSetOptions = {}) {
    if (!this.client || !this.enabled) return;
    const payload = JSON.stringify(value);
    try {
      if (options.ttlSeconds && options.ttlSeconds > 0) {
        await this.client.set(key, payload, 'EX', options.ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
    } catch (error) {
      this.logger.warn(`Cache set failed for key "${key}": ${(error as Error).message}`);
    }
  }

  async del(key: string) {
    if (!this.client || !this.enabled) return 0;
    try {
      return await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete failed for key "${key}": ${(error as Error).message}`);
      return 0;
    }
  }

  async mset(entries: MultiSetEntry[]) {
    if (!this.client || !this.enabled) return;
    if (entries.length === 0) return;
    const pipeline = this.client.multi();
    for (const entry of entries) {
      try {
        const payload = JSON.stringify(entry.value);
        if (entry.ttlSeconds && entry.ttlSeconds > 0) {
          pipeline.set(entry.key, payload, 'EX', entry.ttlSeconds);
        } else {
          pipeline.set(entry.key, payload);
        }
      } catch (error) {
        this.logger.warn(`Skipping cache mset for key "${entry.key}" due to serialization error: ${(error as Error).message}`);
      }
    }
    try {
      await pipeline.exec();
    } catch (error) {
      this.logger.warn(`Cache pipeline execution failed: ${(error as Error).message}`);
    }
  }

  async invalidateAvailability(venueId: string, date: string) {
    if (!this.client || !this.enabled) return;
    const pattern = `${this.availabilityPrefix(venueId, date)}*`;
    let cursor = '0';
    try {
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', '200');
        if (Array.isArray(keys) && keys.length > 0) {
          await this.client.del(...keys);
        }
        cursor = nextCursor;
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate availability cache for venue "${venueId}" on "${date}": ${(error as Error).message}`,
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyKey, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache/cache.service';

type StoredResponse = {
  body: unknown;
  headers?: Record<string, string>;
};

type IdempotencyRecord = {
  id: string;
  method: string;
  path: string;
  bodyHash: string;
  status: number;
  response: StoredResponse;
  createdAt: Date;
  expiresAt: Date;
};

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly ttlMs = 24 * 60 * 60 * 1000;
  private readonly redis: Redis | null;
  private readonly lockTtlMs = 30_000; // 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    cache: CacheService,
  ) {
    this.redis = cache.getClient();
  }

  normalizeKey(raw?: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 200) {
      return trimmed.slice(0, 200);
    }
    return trimmed;
  }

  normalizePath(rawPath?: string | null): string {
    if (!rawPath) return '/';
    const prefixed = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    if (prefixed.length === 1) return prefixed;
    return prefixed.replace(/\/+$/u, '') || '/';
  }

  computeBodyHash(body: unknown): string {
    const canonical = this.canonicalize(body ?? {});
    const json = JSON.stringify(canonical);
    return createHash('sha256').update(json).digest('hex');
  }

  async findEntry(id: string): Promise<IdempotencyRecord | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { id },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      try {
        await this.prisma.idempotencyKey.delete({ where: { id } });
      } catch (error) {
        this.logger.warn(
          `Failed to delete expired idempotency key "${id}": ${(error as Error).message}`,
        );
      }
      return null;
    }
    return this.toRecord(row);
  }

  async storeResponse(params: {
    id: string;
    method: string;
    path: string;
    bodyHash: string;
    status: number;
    body: unknown;
    headers: Record<string, string>;
  }) {
    const expiresAt = new Date(Date.now() + this.ttlMs);
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          id: params.id,
          method: params.method,
          path: params.path,
          bodyHash: params.bodyHash,
          status: params.status,
          response: {
            body: params.body ?? null,
            headers: params.headers,
          } satisfies StoredResponse,
          expiresAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { id: params.id },
        });
        if (!existing) return;
        if (existing.bodyHash !== params.bodyHash) {
          this.logger.warn(
            `Concurrent idempotency write detected for key "${params.id}"`,
          );
        }
        return;
      }
      throw error;
    } finally {
      void this.maybeCleanupExpired();
    }
  }

  async acquireLock(key: string): Promise<boolean> {
    if (this.redis) {
      try {
        const lockKey = `lock:idem:${key}`;
        const result = await this.redis.set(
          lockKey,
          '1',
          'PX',
          this.lockTtlMs,
          'NX',
        );
        return result === 'OK';
      } catch (error) {
        this.logger.warn(
          `Failed to acquire Redis lock for ${key}: ${(error as Error).message}`,
        );
        return false;
      }
    }
    // Fallback: use Postgres advisory lock (session-level, auto-released on disconnect)
    try {
      const lockId = this.hashToLockId(key);
      const result = await this.prisma.$queryRaw<
        Array<{ pg_try_advisory_lock: boolean }>
      >`
        SELECT pg_try_advisory_lock(${lockId}) as pg_try_advisory_lock
      `;
      return result[0]?.pg_try_advisory_lock ?? false;
    } catch (error) {
      this.logger.warn(
        `Failed to acquire Postgres lock for ${key}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    if (this.redis) {
      try {
        const lockKey = `lock:idem:${key}`;
        await this.redis.del(lockKey);
      } catch (error) {
        this.logger.warn(
          `Failed to release Redis lock for ${key}: ${(error as Error).message}`,
        );
      }
      return;
    }
    // Postgres advisory locks are session-level and auto-released, but we can explicitly unlock
    try {
      const lockId = this.hashToLockId(key);
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
    } catch (error) {
      this.logger.warn(
        `Failed to release Postgres lock for ${key}: ${(error as Error).message}`,
      );
    }
  }

  private hashToLockId(key: string): number {
    const hash = createHash('sha256').update(key).digest();
    // Extract first 4 bytes and convert to int32 (Postgres advisory lock uses bigint but we use int for simplicity)
    return hash.readInt32BE(0);
  }

  private async maybeCleanupExpired() {
    if (Math.random() > 0.05) return;
    try {
      await this.prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup expired idempotency keys: ${(error as Error).message}`,
      );
    }
  }

  private canonicalize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([_, val]) => val !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
      const normalized: Record<string, unknown> = {};
      for (const [key, val] of entries) {
        normalized[key] = this.canonicalize(val);
      }
      return normalized;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return String(value);
      }
    }
    return value;
  }

  private toRecord(row: IdempotencyKey): IdempotencyRecord {
    return {
      id: row.id,
      method: row.method,
      path: row.path,
      bodyHash: row.bodyHash,
      status: row.status,
      response: this.parseStoredResponse(row.response),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }

  private parseStoredResponse(value: Prisma.JsonValue): StoredResponse {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { body: null };
    }
    const record = value as Record<string, unknown>;
    const headersRaw = record.headers;
    const headers: Record<string, string> = {};
    if (
      headersRaw &&
      typeof headersRaw === 'object' &&
      !Array.isArray(headersRaw)
    ) {
      for (const [key, headerValue] of Object.entries(
        headersRaw as Record<string, unknown>,
      )) {
        if (headerValue === undefined || headerValue === null) continue;
        headers[key.toLowerCase()] = Array.isArray(headerValue)
          ? headerValue.map((item) => String(item)).join(', ')
          : String(headerValue);
      }
    }
    return {
      body: record.body ?? null,
      headers,
    };
  }
}

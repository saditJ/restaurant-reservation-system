import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyKey, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

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
    if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
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


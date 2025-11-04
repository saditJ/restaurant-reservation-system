import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ApiKey, Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { DEFAULT_TENANT_ID } from '../utils/default-venue';

export type ApiKeyScopes = string[];

export type ApiKeyRecord = {
  id: string;
  tenantId: string;
  name: string;
  hashedKey: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  isActive: boolean;
  rateLimitPerMin: number;
  burstLimit: number;
  scopes: ApiKeyScopes;
};

export type CreateApiKeyParams = {
  tenantId?: string;
  name: string;
  rateLimitPerMin?: number;
  burstLimit?: number;
  scopes?: ApiKeyScopes;
};

export type UpdateApiKeyParams = {
  name?: string;
  rateLimitPerMin?: number;
  burstLimit?: number;
  scopes?: ApiKeyScopes;
  isActive?: boolean;
};

export type AuthenticatedApiKey = Omit<ApiKeyRecord, 'hashedKey'>;

@Injectable()
export class ApiKeyService implements OnModuleInit {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureStaticKeys();
  }

  hashKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  generatePlaintextKey(): string {
    const entropy = randomBytes(24).toString('base64url');
    return `rk_${entropy}`;
  }

  async findByPlaintextKey(value: string): Promise<ApiKeyRecord | null> {
    const hashed = this.hashKey(value);
    const record = await this.prisma.apiKey.findUnique({
      where: { hashedKey: hashed },
    });
    if (!record) return null;
    return this.toRecord(record);
  }

  async listKeys(tenantId?: string): Promise<ApiKeyRecord[]> {
    const items = await this.prisma.apiKey.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ createdAt: 'desc' }],
    });
    return items.map((item) => this.toRecord(item));
  }

  async createKey(params: CreateApiKeyParams): Promise<{
    key: ApiKeyRecord;
    plaintext: string;
  }> {
    const tenantId = (params.tenantId ?? DEFAULT_TENANT_ID).trim();
    if (!tenantId) {
      throw new Error('tenantId is required to create API keys');
    }

    const plaintext = this.generatePlaintextKey();
    const hashedKey = this.hashKey(plaintext);
    const rateLimitPerMin = sanitizeRate(params.rateLimitPerMin);
    const burstLimit = sanitizeBurst(params.burstLimit, rateLimitPerMin);
    const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : ['default'];

    const created = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: params.name.trim(),
        hashedKey,
        rateLimitPerMin,
        burstLimit,
        scopeJSON: scopes,
      },
    });

    return {
      key: this.toRecord(created),
      plaintext,
    };
  }

  async rotateKey(id: string): Promise<{
    key: ApiKeyRecord;
    plaintext: string;
  }> {
    const plaintext = this.generatePlaintextKey();
    const hashedKey = this.hashKey(plaintext);
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        hashedKey,
        lastUsedAt: null,
      },
    });
    return { key: this.toRecord(updated), plaintext };
  }

  async updateKey(id: string, params: UpdateApiKeyParams): Promise<ApiKeyRecord> {
    const data: Prisma.ApiKeyUpdateInput = {};

    if (params.name !== undefined) {
      data.name = params.name.trim();
    }
    if (params.rateLimitPerMin !== undefined) {
      data.rateLimitPerMin = sanitizeRate(params.rateLimitPerMin);
    }
    if (params.burstLimit !== undefined) {
      const rate =
        params.rateLimitPerMin !== undefined
          ? sanitizeRate(params.rateLimitPerMin)
          : undefined;
      data.burstLimit = sanitizeBurst(params.burstLimit, rate);
    }
    if (params.scopes !== undefined) {
      data.scopeJSON = params.scopes;
    }
    if (params.isActive !== undefined) {
      data.isActive = params.isActive;
    }

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data,
    });
    return this.toRecord(updated);
  }

  async disableKey(id: string): Promise<ApiKeyRecord> {
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toRecord(updated);
  }

  async touchLastUsed(id: string): Promise<void> {
    try {
      await this.prisma.apiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Failed to update lastUsedAt for key ${id}: ${(error as Error).message}`);
    }
  }

  private async ensureStaticKeys(): Promise<void> {
    const configuredKeys = this.collectConfiguredPlaintextKeys();

    if (configuredKeys.length === 0) {
      const existing = await this.prisma.apiKey.count();
      if (existing > 0 || this.isProduction()) {
        return;
      }
      configuredKeys.push('dev-local-key');
      this.logger.warn(
        'No API keys configured; bootstrapping default development key "dev-local-key".',
      );
    }

    let index = 0;
    for (const plaintext of configuredKeys) {
      const sanitized = plaintext.trim();
      if (!sanitized) continue;
      const hashedKey = this.hashKey(sanitized);
      try {
        await this.prisma.apiKey.upsert({
          where: { hashedKey },
          update: {
            tenantId: DEFAULT_TENANT_ID,
          },
          create: {
            name: configuredKeys.length === 1 ? 'Bootstrap API Key' : `Bootstrap API Key ${index + 1}`,
            hashedKey,
            isActive: true,
            scopeJSON: ['default'],
            tenantId: DEFAULT_TENANT_ID,
          },
        });
        index += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to ensure static API key ${index + 1}: ${(error as Error).message}`,
        );
      }
    }
  }

  private collectConfiguredPlaintextKeys(): string[] {
    const keys = new Set<string>();

    const multi = process.env.API_KEYS ?? '';
    for (const entry of multi.split(',').map((item) => item.trim())) {
      if (entry) keys.add(entry);
    }

    const single = (process.env.API_KEY ?? '').trim();
    if (single) keys.add(single);

    return Array.from(keys);
  }

  private isProduction(): boolean {
    return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  }

  private toRecord(entity: ApiKey): ApiKeyRecord {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      hashedKey: entity.hashedKey,
      createdAt: entity.createdAt,
      lastUsedAt: entity.lastUsedAt ?? null,
      isActive: entity.isActive,
      rateLimitPerMin: entity.rateLimitPerMin,
      burstLimit: entity.burstLimit,
      scopes: this.parseScopes(entity.scopeJSON),
    };
  }

  toAuthenticated(record: ApiKeyRecord): AuthenticatedApiKey {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hashedKey, ...rest } = record;
    return rest;
  }

  private parseScopes(value: Prisma.JsonValue | null | undefined): ApiKeyScopes {
    if (!value) return ['default'];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item : null))
        .filter((item): item is string => Boolean(item));
    }
    if (typeof value === 'object' && 'scopes' in value) {
      const payload = value as { scopes?: unknown };
      if (Array.isArray(payload.scopes)) {
        return payload.scopes
          .map((item) => (typeof item === 'string' ? item : null))
          .filter((item): item is string => Boolean(item));
      }
    }
    return ['default'];
  }
}

function sanitizeRate(input: number | undefined): number {
  const value = Number(input ?? 60);
  if (!Number.isFinite(value) || value <= 0) return 60;
  return Math.min(Math.floor(value), 10_000);
}

function sanitizeBurst(input: number | undefined, rate?: number): number {
  const baseline = rate ?? 60;
  if (input === undefined || input === null) {
    return Math.max(baseline, 1);
  }
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    return Math.max(baseline, 1);
  }
  return Math.min(Math.floor(Math.max(value, 1)), 20_000);
}

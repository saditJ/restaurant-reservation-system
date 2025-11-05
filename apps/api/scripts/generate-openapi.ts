import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import '../src/bootstrap-env';
import { AppModule } from '../src/app.module';
import {
  ApiKeyRecord,
  ApiKeyService,
  AuthenticatedApiKey,
  CreateApiKeyParams,
  UpdateApiKeyParams,
} from '../src/auth/api-key.service';
import { HoldsCleanupService } from '../src/holds.cleanup.service';
import { CacheService } from '../src/cache/cache.service';
import { RateLimitService, type RateLimitConfig } from '../src/rate-limit/rate-limit.service';
import type { RateLimitOptions } from '../src/rate-limit/rate-limit.decorator';
import { RateLimitUsageService } from '../src/rate-limit/rate-limit-usage.service';

if (!process.env.PRISMA_SKIP_CONNECT) {
  process.env.PRISMA_SKIP_CONNECT = 'true';
}

// eslint-disable-next-line no-console
console.log('Generating OpenAPI document...');

class CacheServiceStub {
  isReady() {
    return false;
  }

  getClient() {
    return null;
  }

  buildAvailabilityKey() {
    return '';
  }

  availabilityPrefix() {
    return '';
  }

  async get() {
    return { value: null, status: 'skipped' as const };
  }

  async set() {
    // no-op
  }

  async del() {
    return 0;
  }

  async mset() {
    // no-op
  }

  async invalidateAvailability() {
    // no-op
  }
}

class RateLimitServiceStub {
  resolveConfig(
    key: AuthenticatedApiKey,
    override?: RateLimitOptions,
  ): RateLimitConfig | null {
    const perMinute = override?.requestsPerMinute ?? key.rateLimitPerMin ?? 60;
    if (perMinute <= 0) {
      return null;
    }
    const burst =
      override?.burstLimit ?? key.burstLimit ?? Math.max(perMinute, 1);
    return {
      requestsPerMinute: perMinute,
      burstLimit: burst,
    };
  }

  async tryConsume(): Promise<{ allowed: boolean; remaining: number }> {
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER };
  }
}

class RateLimitUsageServiceStub {
  async recordAllow() {
    // no-op
  }

  async recordDrop() {
    // no-op
  }

  async getUsageSummary(keyIds: string[]): Promise<
    Record<string, { allows24h: number; drops24h: number }>
  > {
    return Object.fromEntries(
      keyIds.map((id) => [id, { allows24h: 0, drops24h: 0 }]),
    );
  }
}

class ApiKeyServiceStub {
  private readonly stubRecord: ApiKeyRecord = {
    id: 'stub-key',
    tenantId: 'default',
    name: 'Stub API Key',
    hashedKey: 'stub-hash',
    createdAt: new Date(0),
    lastUsedAt: null,
    isActive: true,
    rateLimitPerMin: 60,
    burstLimit: 120,
    scopes: ['default'],
  };

  async onModuleInit() {
    // no-op
  }

  hashKey(value: string): string {
    return `hash:${value}`;
  }

  generatePlaintextKey(): string {
    return 'rk_stub_plaintext';
  }

  async findByPlaintextKey(): Promise<ApiKeyRecord | null> {
    return this.stubRecord;
  }

  async listKeys(): Promise<ApiKeyRecord[]> {
    return [this.stubRecord];
  }

  async createKey(
    _params: CreateApiKeyParams,
  ): Promise<{ key: ApiKeyRecord; plaintext: string }> {
    return { key: this.stubRecord, plaintext: 'rk_stub_plaintext' };
  }

  async rotateKey(_id: string): Promise<{ key: ApiKeyRecord; plaintext: string }> {
    return { key: this.stubRecord, plaintext: 'rk_stub_plaintext' };
  }

  async updateKey(_id: string, _params: UpdateApiKeyParams): Promise<ApiKeyRecord> {
    return this.stubRecord;
  }

  async disableKey(_id: string): Promise<ApiKeyRecord> {
    return this.stubRecord;
  }

  async enableKey(_id: string): Promise<ApiKeyRecord> {
    return this.stubRecord;
  }

  async touchLastUsed(_id: string): Promise<void> {
    // no-op
  }

  toAuthenticated(record: ApiKeyRecord): AuthenticatedApiKey {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hashedKey, ...rest } = record;
    return rest;
  }

  toRecord(record: ApiKeyRecord): ApiKeyRecord {
    return record;
  }
}

class HoldsCleanupServiceStub {
  async onModuleInit() {
    // no-op
  }

  async onModuleDestroy() {
    // no-op
  }
}

async function generate() {
  // eslint-disable-next-line no-console
  console.log('Creating Nest application...');

  const testingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CacheService)
    .useClass(CacheServiceStub)
    .overrideProvider(RateLimitService)
    .useClass(RateLimitServiceStub)
    .overrideProvider(RateLimitUsageService)
    .useClass(RateLimitUsageServiceStub)
    .overrideProvider(ApiKeyService)
    .useValue(new ApiKeyServiceStub())
    .overrideProvider(HoldsCleanupService)
    .useValue(new HoldsCleanupServiceStub())
    .compile();

  const app = testingModule.createNestApplication();
  app.useLogger(false);
  await app.init();

  // eslint-disable-next-line no-console
  console.log('Nest application created. Building Swagger config...');

  const config = new DocumentBuilder()
    .setTitle('Reserve Platform API')
    .setDescription(
      'REST API for reservation management, webhooks, and integrations.',
    )
    .setVersion(process.env.npm_package_version ?? '1.0.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key issued via the console settings',
      },
      'ApiKeyAuth',
    )
    .build();

  // eslint-disable-next-line no-console
  console.log('Generating OpenAPI document from application routes...');
  const document = SwaggerModule.createDocument(app, config);
  document.paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).filter(([path]) =>
      path.startsWith('/v1/'),
    ),
  );

  // eslint-disable-next-line no-console
  console.log('Filtering paths and writing to disk...');
  const outputPath = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2));
  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written to ${outputPath}`);

  // eslint-disable-next-line no-console
  console.log('Closing Nest application...');
  await app.close();
}

generate().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate OpenAPI document', error);
  process.exitCode = 1;
});

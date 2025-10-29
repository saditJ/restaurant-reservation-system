import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import {
  ApiKeyRecord,
  ApiKeyService,
  AuthenticatedApiKey,
  CreateApiKeyParams,
  UpdateApiKeyParams,
} from '../auth/api-key.service';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitUsageService } from '../rate-limit/rate-limit-usage.service';

type ApiKeySummary = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  rateLimitPerMin: number;
  burstLimit: number;
  scopes: string[];
  usage: {
    allows24h: number;
    drops24h: number;
  };
};

type ApiKeyWithSecret = {
  key: ApiKeySummary;
  plaintextKey: string;
};

class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100_000)
  rateLimitPerMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(200_000)
  burstLimit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}

class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100_000)
  rateLimitPerMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(200_000)
  burstLimit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
@Controller('v1/admin/api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly usage: RateLimitUsageService,
  ) {}

  @Get()
  async list(): Promise<{ items: ApiKeySummary[] }> {
    const keys = await this.apiKeys.listKeys();
    const usage = await this.usage.getUsageSummary(keys.map((key) => key.id));
    return {
      items: keys.map((key) => this.toSummary(key, usage[key.id])),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ requestsPerMinute: 30, burstLimit: 10 })
  async create(@Body() body: CreateApiKeyDto): Promise<ApiKeyWithSecret> {
    const params: CreateApiKeyParams = {
      name: body.name,
      rateLimitPerMin: body.rateLimitPerMin,
      burstLimit: body.burstLimit,
      scopes: body.scopes ?? undefined,
    };
    const result = await this.apiKeys.createKey(params);
    return {
      key: this.toSummary(result.key),
      plaintextKey: result.plaintext,
    };
  }

  @Post(':id/rotate')
  @RateLimit({ requestsPerMinute: 60, burstLimit: 20 })
  async rotate(@Param('id') id: string): Promise<ApiKeyWithSecret> {
    const result = await this.apiKeys.rotateKey(id);
    return {
      key: this.toSummary(result.key),
      plaintextKey: result.plaintext,
    };
  }

  @Post(':id/disable')
  @RateLimit({ requestsPerMinute: 60, burstLimit: 20 })
  async disable(@Param('id') id: string): Promise<{ key: ApiKeySummary }> {
    const key = await this.apiKeys.disableKey(id);
    return { key: this.toSummary(key) };
  }

  @Patch(':id')
  @RateLimit({ requestsPerMinute: 120, burstLimit: 40 })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateApiKeyDto,
  ): Promise<{ key: ApiKeySummary }> {
    const params: UpdateApiKeyParams = {};
    if (body.name !== undefined) params.name = body.name;
    if (body.rateLimitPerMin !== undefined) params.rateLimitPerMin = body.rateLimitPerMin;
    if (body.burstLimit !== undefined) params.burstLimit = body.burstLimit;
    if (body.scopes !== undefined) params.scopes = body.scopes;
    if (body.isActive !== undefined) params.isActive = body.isActive;

    const updated = await this.apiKeys.updateKey(id, params);
    return { key: this.toSummary(updated) };
  }

  private toSummary(
    record: ApiKeyRecord | AuthenticatedApiKey,
    usage?: { allows24h: number; drops24h: number },
  ): ApiKeySummary {
    return {
      id: record.id,
      name: record.name,
      isActive: record.isActive,
      createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
      lastUsedAt:
        record.lastUsedAt instanceof Date
          ? record.lastUsedAt.toISOString()
          : record.lastUsedAt ?? null,
      rateLimitPerMin: record.rateLimitPerMin,
      burstLimit: record.burstLimit,
      scopes: [...record.scopes],
      usage: {
        allows24h: usage?.allows24h ?? 0,
        drops24h: usage?.drops24h ?? 0,
      },
    };
  }
}

import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import type { ServiceBuffer } from '@prisma/client';

type ServiceBufferSummary = {
  venueId: string;
  beforeMinutes: number;
  afterMinutes: number;
  updatedAt: string;
};

class ServiceBufferQueryDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;
}

class UpsertServiceBufferDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  beforeMinutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  afterMinutes?: number;
}

function toSummary(entry: ServiceBuffer | null, venueId: string): ServiceBufferSummary {
  return {
    venueId,
    beforeMinutes: entry?.beforeMinutes ?? 0,
    afterMinutes: entry?.afterMinutes ?? 0,
    updatedAt: (entry?.updatedAt ?? new Date(0)).toISOString(),
  };
}

@ApiTags('Admin Service Buffers')
@UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
@Controller('v1/admin/service-buffers')
export class AdminServiceBuffersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get service buffer for a venue' })
  async get(
    @Query() query: ServiceBufferQueryDto,
  ): Promise<{ buffer: ServiceBufferSummary }> {
    const buffer = await this.prisma.serviceBuffer.findUnique({
      where: { venueId: query.venueId },
    });
    return { buffer: toSummary(buffer, query.venueId) };
  }

  @Put()
  @RateLimit({ requestsPerMinute: 30, burstLimit: 15 })
  @ApiOperation({ summary: 'Upsert service buffer for a venue' })
  async upsert(
    @Body() body: UpsertServiceBufferDto,
  ): Promise<{ buffer: ServiceBufferSummary }> {
    const buffer = await this.prisma.serviceBuffer.upsert({
      where: { venueId: body.venueId },
      update: {
        beforeMinutes: body.beforeMinutes ?? 0,
        afterMinutes: body.afterMinutes ?? 0,
      },
      create: {
        venueId: body.venueId,
        beforeMinutes: body.beforeMinutes ?? 0,
        afterMinutes: body.afterMinutes ?? 0,
      },
    });
    return { buffer: toSummary(buffer, body.venueId) };
  }
}

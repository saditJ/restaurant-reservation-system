import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Prisma, PacingRule } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

type PacingRuleSummary = {
  id: string;
  venueId: string;
  windowMinutes: number;
  maxReservations: number | null;
  maxCovers: number | null;
  updatedAt: string;
};

class PacingRuleQueryDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;
}

class CreatePacingRuleDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(240)
  windowMinutes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(500)
  maxReservations?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(1000)
  maxCovers?: number;
}

class UpdatePacingRuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(240)
  windowMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(500)
  maxReservations?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(1000)
  maxCovers?: number;
}

function toSummary(rule: PacingRule): PacingRuleSummary {
  return {
    id: rule.id,
    venueId: rule.venueId,
    windowMinutes: rule.windowMinutes,
    maxReservations: rule.maxReservations,
    maxCovers: rule.maxCovers,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

@ApiTags('Admin Pacing Rules')
@UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
@Controller('v1/admin/pacing-rules')
export class AdminPacingRulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List pacing rules for a venue' })
  async list(
    @Query() query: PacingRuleQueryDto,
  ): Promise<{ items: PacingRuleSummary[] }> {
    const rules = await this.prisma.pacingRule.findMany({
      where: { venueId: query.venueId },
      orderBy: [{ windowMinutes: 'asc' }, { id: 'asc' }],
    });
    return { items: rules.map(toSummary) };
  }

  @Post()
  @RateLimit({ requestsPerMinute: 20, burstLimit: 10 })
  @ApiOperation({ summary: 'Create a pacing rule' })
  async create(
    @Body() body: CreatePacingRuleDto,
  ): Promise<{ rule: PacingRuleSummary }> {
    const rule = await this.prisma.pacingRule.create({
      data: {
        venueId: body.venueId,
        windowMinutes: body.windowMinutes,
        maxReservations: body.maxReservations ?? null,
        maxCovers: body.maxCovers ?? null,
      },
    });
    return { rule: toSummary(rule) };
  }

  @Patch(':id')
  @RateLimit({ requestsPerMinute: 40, burstLimit: 15 })
  @ApiOperation({ summary: 'Update a pacing rule' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdatePacingRuleDto,
  ): Promise<{ rule: PacingRuleSummary }> {
    const data: Prisma.PacingRuleUpdateInput = {};
    if (body.windowMinutes !== undefined)
      data.windowMinutes = body.windowMinutes;
    if (body.maxReservations !== undefined)
      data.maxReservations = body.maxReservations;
    if (body.maxCovers !== undefined) data.maxCovers = body.maxCovers;

    const rule = await this.prisma.pacingRule.update({ where: { id }, data });
    return { rule: toSummary(rule) };
  }

  @Delete(':id')
  @RateLimit({ requestsPerMinute: 40, burstLimit: 15 })
  @ApiOperation({ summary: 'Delete a pacing rule' })
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.prisma.pacingRule.delete({ where: { id } });
    return { deleted: true };
  }
}

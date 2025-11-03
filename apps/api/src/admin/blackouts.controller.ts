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
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { PrismaService } from '../prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import type { BlackoutDate } from '@prisma/client';

type BlackoutSummary = {
  id: string;
  venueId: string;
  date: string;
  reason: string | null;
  updatedAt: string;
};

class BlackoutQueryDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;
}

class CreateBlackoutDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  reason?: string;
}

class UpdateBlackoutDto {
  @IsOptional()
  @IsString()
  @Length(0, 255)
  reason?: string;
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toSummary(entry: BlackoutDate): BlackoutSummary {
  return {
    id: entry.id,
    venueId: entry.venueId,
    date: entry.date.toISOString().slice(0, 10),
    reason: entry.reason ?? null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

@ApiTags('Admin Blackouts')
@UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
@Controller('v1/admin/blackouts')
export class AdminBlackoutsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List blackout dates for a venue' })
  async list(
    @Query() query: BlackoutQueryDto,
  ): Promise<{ items: BlackoutSummary[] }> {
    const items = await this.prisma.blackoutDate.findMany({
      where: { venueId: query.venueId },
      orderBy: [{ date: 'asc' }],
    });
    return { items: items.map(toSummary) };
  }

  @Post()
  @RateLimit({ requestsPerMinute: 20, burstLimit: 10 })
  @ApiOperation({ summary: 'Create a blackout date' })
  async create(
    @Body() body: CreateBlackoutDto,
  ): Promise<{ blackout: BlackoutSummary }> {
    const blackout = await this.prisma.blackoutDate.create({
      data: {
        venueId: body.venueId,
        date: toDate(body.date),
        reason: body.reason ?? null,
      },
    });
    return { blackout: toSummary(blackout) };
  }

  @Patch(':id')
  @RateLimit({ requestsPerMinute: 40, burstLimit: 15 })
  @ApiOperation({ summary: 'Update a blackout date' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBlackoutDto,
  ): Promise<{ blackout: BlackoutSummary }> {
    const blackout = await this.prisma.blackoutDate.update({
      where: { id },
      data: {
        reason: body.reason ?? null,
      },
    });
    return { blackout: toSummary(blackout) };
  }

  @Delete(':id')
  @RateLimit({ requestsPerMinute: 40, burstLimit: 15 })
  @ApiOperation({ summary: 'Delete a blackout date' })
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.prisma.blackoutDate.delete({ where: { id } });
    return { deleted: true };
  }
}

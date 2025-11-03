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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import type { Prisma, Shift } from '@prisma/client';

type ShiftSummary = {
  id: string;
  venueId: string;
  dow: number;
  startsAt: string;
  endsAt: string;
  capacitySeats: number;
  capacityCovers: number;
  isActive: boolean;
  updatedAt: string;
};

class ShiftQueryDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;
}

class CreateShiftDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dow!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startsAt!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endsAt!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  capacitySeats!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  capacityCovers!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateShiftDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dow?: number;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startsAt?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  capacitySeats?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  capacityCovers?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

function toTime(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function formatShift(shift: Shift): ShiftSummary {
  const toTimeString = (input: Date) =>
    `${String(input.getUTCHours()).padStart(2, '0')}:${String(input.getUTCMinutes()).padStart(2, '0')}`;
  return {
    id: shift.id,
    venueId: shift.venueId,
    dow: shift.dow,
    startsAt: toTimeString(shift.startsAtLocal),
    endsAt: toTimeString(shift.endsAtLocal),
    capacitySeats: shift.capacitySeats,
    capacityCovers: shift.capacityCovers,
    isActive: shift.isActive,
    updatedAt: shift.updatedAt.toISOString(),
  };
}

@ApiTags('Admin Shifts')
@UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
@Controller('v1/admin/shifts')
export class AdminShiftsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List shifts for a venue' })
  @ApiResponse({ status: 200, description: 'Returns shifts', type: Object })
  async list(@Query() query: ShiftQueryDto): Promise<{ items: ShiftSummary[] }> {
    const shifts = await this.prisma.shift.findMany({
      where: { venueId: query.venueId },
      orderBy: [
        { dow: 'asc' },
        { startsAtLocal: 'asc' },
      ],
    });
    return {
      items: shifts.map(formatShift),
    };
  }

  @Post()
  @RateLimit({ requestsPerMinute: 20, burstLimit: 10 })
  @ApiOperation({ summary: 'Create a shift' })
  async create(@Body() body: CreateShiftDto): Promise<{ shift: ShiftSummary }> {
    const shift = await this.prisma.shift.create({
      data: {
        venueId: body.venueId,
        dow: body.dow,
        startsAtLocal: toTime(body.startsAt),
        endsAtLocal: toTime(body.endsAt),
        capacitySeats: body.capacitySeats,
        capacityCovers: body.capacityCovers,
        isActive: body.isActive ?? true,
      },
    });
    return { shift: formatShift(shift) };
  }

  @Patch(':id')
  @RateLimit({ requestsPerMinute: 40, burstLimit: 15 })
  @ApiOperation({ summary: 'Update a shift' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateShiftDto,
  ): Promise<{ shift: ShiftSummary }> {
    const data: Prisma.ShiftUpdateInput = {};
    if (body.dow !== undefined) data.dow = body.dow;
    if (body.startsAt !== undefined) data.startsAtLocal = toTime(body.startsAt);
    if (body.endsAt !== undefined) data.endsAtLocal = toTime(body.endsAt);
    if (body.capacitySeats !== undefined) data.capacitySeats = body.capacitySeats;
    if (body.capacityCovers !== undefined) data.capacityCovers = body.capacityCovers;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const shift = await this.prisma.shift.update({
      where: { id },
      data,
    });
    return { shift: formatShift(shift) };
  }

  @Delete(':id')
  @RateLimit({ requestsPerMinute: 40, burstLimit: 15 })
  @ApiOperation({ summary: 'Delete a shift' })
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.prisma.shift.delete({ where: { id } });
    return { deleted: true };
  }
}

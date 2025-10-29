// apps/api/src/holds.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Hold } from '@prisma/client';
import { HoldsService } from './holds.service';
import { ApiKeyGuard } from './auth/api-key.guard';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimit } from './rate-limit/rate-limit.decorator';

type CreateHoldRequestBody = {
  venueId?: string;
  date?: string | null;
  time?: string | null;
  party?: number;
  partySize?: number;
  tableId?: string | null;
  ttlSec?: number | null;
  createdBy?: string;
};

@Controller('v1/holds')
export class HoldsController {
  constructor(private readonly svc: HoldsService) {}

  @Get()
  async list(@Query('venueId') venueId?: string, @Query('date') date?: string) {
    const items = await this.svc.list({ venueId, date });
    const dtos = items.map(toDto);
    return { items: dtos, total: dtos.length };
  }

  // POST /holds  ? create a real server-side hold with expiry
  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 240, burstLimit: 120 })
  @UseInterceptors(IdempotencyInterceptor)
  @Post()
  async create(@Body() body: CreateHoldRequestBody) {
    const {
      venueId,
      date,
      time,
      party,
      partySize,
      tableId,
      ttlSec,
      createdBy,
    } = body;

    const hold = await this.svc.create({
      venueId,
      date: String(date ?? ''),
      time: String(time ?? ''),
      partySize: Number(party ?? partySize ?? 0),
      tableId: tableId ?? null,
      ttlSec: typeof ttlSec === 'number' ? ttlSec : Number(ttlSec ?? 600),
      createdBy,
    });
    return toDto(hold);
  }

  // DELETE /holds/:id  ? cancel a hold (mark expired)
  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @Delete(':id')
  async cancel(@Param('id') id: string) {
    const h = await this.svc.cancel(id);
    return { ok: true, hold: toDto(h) };
  }
}

// ---- DTO mapper ----
function toDto(h: Hold & { table?: { label: string | null } | null }) {
  return {
    id: h.id,
    status: h.status,
    expiresAt: h.expiresAt.toISOString(),
    venueId: h.venueId,
    booking: {
      date: h.slotLocalDate,
      time: h.slotLocalTime,
      partySize: h.partySize,
      party: h.partySize, // compatibility alias
      tableId: h.tableId ?? null,
      tableLabel: h.table?.label ?? null,
    },
  };
}

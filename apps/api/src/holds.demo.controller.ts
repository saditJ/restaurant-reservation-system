import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './auth/api-key.guard';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimit } from './rate-limit/rate-limit.decorator';

type Hold = {
  id: string;
  status: 'held';
  expiresAt: string;
  payload: {
    date: string;
    time: string;
    party: number;
    tableId: string | null;
  };
};

type DemoHoldBody = {
  date?: string | null;
  time?: string | null;
  party?: number | null;
  tableId?: string | null;
};

@Controller('v1/holds')
export class HoldsDemoController {
  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  @Post('demo')
  create(@Body() body: DemoHoldBody): Hold {
    const id = 'HOLD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const partySizeValue = body.party ?? 1;
    return {
      id,
      status: 'held',
      expiresAt,
      payload: {
        date: String(body.date ?? ''),
        time: String(body.time ?? ''),
        party: Number.isFinite(partySizeValue) ? Number(partySizeValue) : 1,
        tableId: body.tableId ?? null,
      },
    };
  }
}

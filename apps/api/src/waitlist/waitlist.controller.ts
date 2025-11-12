import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { ListWaitlistQueryDto } from './dto/list-waitlist-query.dto';
import { OfferWaitlistDto } from './dto/offer-waitlist.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';

@Controller('v1/waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 120, burstLimit: 60 })
  @UseInterceptors(IdempotencyInterceptor)
  @Post()
  create(@Body() body: CreateWaitlistDto) {
    return this.waitlist.create(body);
  }

  @UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 120, burstLimit: 60 })
  @Get()
  list(@Query() query: ListWaitlistQueryDto) {
    return this.waitlist.list(query);
  }

  @UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  @UseInterceptors(IdempotencyInterceptor)
  @Post(':id/offer')
  offer(@Param('id') id: string, @Body() body: OfferWaitlistDto) {
    return this.waitlist.offer(id, body);
  }

  @UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  @Post(':id/expire')
  expire(@Param('id') id: string) {
    return this.waitlist.expire(id);
  }

  @UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  @Post(':id/convert')
  convert(@Param('id') id: string) {
    return this.waitlist.convert(id);
  }

  @UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  @Get('offers/recent')
  recentOffers(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.waitlist.listRecentOffers(
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 240, burstLimit: 120 })
  @Get('offer/:code')
  resolve(@Param('code') code: string, @Query('token') token?: string) {
    return this.waitlist.resolveOfferCode(code, token);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 240, burstLimit: 120 })
  @Post('offer/:code/convert')
  consumeOffer(@Param('code') code: string, @Body() body: { token?: string }) {
    return this.waitlist.consumeOffer(code, body?.token ?? null);
  }
}

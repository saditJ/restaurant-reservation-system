import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import {
  GuestRequestContext,
  GuestReservationsService,
} from './guest-reservations.service';
import { GuestRescheduleDto } from './dto/guest-reschedule.dto';

@Controller('v1/guest/reservations')
@Public()
export class GuestReservationsController {
  constructor(private readonly guestReservations: GuestReservationsService) {}

  @Get(':token')
  @UseGuards(RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 20 })
  getReservation(@Param('token') token: string) {
    return this.guestReservations.getReservation(token);
  }

  @Post(':token/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ requestsPerMinute: 20, burstLimit: 10 })
  cancelReservation(@Param('token') token: string, @Req() req: Request) {
    return this.guestReservations.cancelReservation(
      token,
      this.buildContext(req),
    );
  }

  @Post(':token/reschedule')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ requestsPerMinute: 20, burstLimit: 10 })
  rescheduleReservation(
    @Param('token') token: string,
    @Body() body: GuestRescheduleDto,
    @Req() req: Request,
  ) {
    return this.guestReservations.rescheduleReservation(
      token,
      body,
      this.buildContext(req),
    );
  }

  private buildContext(
    req: Request & { requestId?: string; tenantId?: string },
  ): GuestRequestContext {
    const routePath = req.baseUrl
      ? `${req.baseUrl}${req.route?.path ?? ''}`
      : (req.route?.path ?? req.originalUrl ?? req.url);
    return {
      route: routePath,
      method: req.method,
      requestId: req.requestId,
      tenantId: req.tenantId,
      ip: this.extractIp(req),
    };
  }

  private extractIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0];
    }
    if (req.ip) return req.ip;
    return req.socket?.remoteAddress;
  }
}

import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationOutboxStatus } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import {
  NotificationOutboxFilters,
  NotificationsAdminService,
} from './notifications.admin.service';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

@UseGuards(ApiKeyGuard, RateLimitGuard)
@Controller('v1/notifications/outbox')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsAdminService) {}

  @Get()
  list(
    @Query('status') status?: NotificationOutboxStatus,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters: NotificationOutboxFilters = {
      status: this.normalizeStatus(status),
      search: search?.trim() || undefined,
    };
    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      filters.limit = parsedLimit;
    }
    if (Number.isFinite(parsedOffset) && parsedOffset >= 0) {
      filters.offset = parsedOffset;
    }
    return this.notifications.list(filters);
  }

  @RateLimit({ requestsPerMinute: 60, burstLimit: 20 })
  @Post(':id/requeue')
  requeue(@Param('id') id: string) {
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('Invalid notification id');
    }
    return this.notifications.requeue(id);
  }

  private normalizeStatus(
    status?: NotificationOutboxStatus,
  ): NotificationOutboxStatus | undefined {
    if (!status) return undefined;
    const normalized = String(status).toUpperCase();
    switch (normalized) {
      case NotificationOutboxStatus.PENDING:
        return NotificationOutboxStatus.PENDING;
      case NotificationOutboxStatus.SENT:
        return NotificationOutboxStatus.SENT;
      case NotificationOutboxStatus.FAILED:
        return NotificationOutboxStatus.FAILED;
      default:
        return undefined;
    }
  }
}

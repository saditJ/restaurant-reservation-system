import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import { AuditLogService } from './audit-log.service';

@Controller('v1/audit')
@UseGuards(ApiKeyGuard, AdminApiGuard)
export class AuditController {
  constructor(private readonly audit: AuditLogService) {}

  @Get('logs')
  async list(
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsedLimit = clampNumber(limit, 1, 200);
    const parsedOffset = clampNumber(offset, 0, 10_000);
    const rangeStart = parseDate(from);
    const rangeEnd = parseDate(to);
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      throw new BadRequestException('from must be before to');
    }

    const sanitizedActor = sanitize(actor);
    const sanitizedAction = sanitize(action);
    const sanitizedResource = sanitize(resource);

    return this.audit.list({
      limit: parsedLimit,
      offset: parsedOffset,
      actor: sanitizedActor,
      action: sanitizedAction,
      resource: sanitizedResource,
      from: rangeStart ?? undefined,
      to: rangeEnd ?? undefined,
    });
  }
}

function clampNumber(value: string, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new BadRequestException('Invalid numeric parameter');
  }
  if (numeric < min || numeric > max) {
    throw new BadRequestException(
      `Numeric parameter must be between ${min} and ${max}`,
    );
  }
  return Math.floor(numeric);
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid date parameter');
  }
  return parsed;
}

function sanitize(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

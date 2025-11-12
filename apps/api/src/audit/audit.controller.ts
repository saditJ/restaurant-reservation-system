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

const PAGE_SIZE = 50;

@Controller('v1/audit')
@UseGuards(ApiKeyGuard, AdminApiGuard)
export class AuditController {
  constructor(private readonly audit: AuditLogService) {}

  @Get('logs')
  async list(
    @Query('actor') actor?: string,
    @Query('route') route?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
  ) {
    const parsedPage = clampNumber(page, 1, 4000);
    const rangeStart = parseDate(from);
    const rangeEnd = parseDate(to);
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      throw new BadRequestException('from must be before to');
    }

    const sanitizedActor = sanitize(actor);
    const sanitizedRoute = sanitize(route);

    const result = await this.audit.list({
      limit: PAGE_SIZE,
      offset: (parsedPage - 1) * PAGE_SIZE,
      actor: sanitizedActor,
      route: sanitizedRoute,
      from: rangeStart ?? undefined,
      to: rangeEnd ?? undefined,
    });

    return {
      total: result.total,
      items: result.items.map((entry) => ({
        ts: entry.createdAt.toISOString(),
        actor: entry.actor,
        route: entry.route ?? entry.resource ?? null,
        method: entry.method ?? null,
        status: entry.statusCode ?? null,
        requestId: entry.requestId ?? null,
        tenantId: entry.tenantId ?? null,
      })),
    };
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

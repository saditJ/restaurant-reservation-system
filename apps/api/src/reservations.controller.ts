// apps/api/src/reservations.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Headers,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { SeatingService, SeatingSuggestionsResponse } from './seating.service';
import { AssignReservationTablesDto } from './dto/assign-reservation-tables.dto';
import { ReservationStatus } from '@prisma/client';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ApiKeyGuard } from './auth/api-key.guard';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimit } from './rate-limit/rate-limit.decorator';

@Controller('v1/reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService, private readonly seating: SeatingService) {}

  @Get()
  list(
    @Query('venueId') venueId?: string,
    @Query('date') date?: string,
    @Query('status') status?: ReservationStatus,
    @Query('tableId') tableId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('includeConflicts') includeConflicts?: string,
  ) {
    const normalizedStatus = status
      ? (String(status).toUpperCase() as ReservationStatus)
      : undefined;
    return this.reservations.list({
      venueId: venueId || undefined,
      date: date || undefined,
      status: normalizedStatus,
      tableId: tableId || undefined,
      q: q || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      sortBy: sortBy || undefined,
      sortDir:
        sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
      includeConflicts: this.parseBoolean(includeConflicts),
    });
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 180, burstLimit: 90 })
  @UseInterceptors(IdempotencyInterceptor)
  @Post()
  create(@Body() body: CreateReservationDto) {
    return this.reservations.create(body);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @Post(':id/suggestions')
  suggestions(
    @Param('id') id: string,
    @Body() body?: { limit?: number | string },
  ): Promise<SeatingSuggestionsResponse> {
    const raw = body?.limit;
    const parsed =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
        ? Number(raw)
        : undefined;
    const limit =
      Number.isFinite(parsed) && parsed && parsed > 0
        ? Math.min(Math.floor(parsed), 10)
        : 3;
    return this.seating.suggest(id, limit);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @Post(':id/assign')
  assignTables(
    @Param('id') id: string,
    @Body() body: AssignReservationTablesDto,
  ) {
    const incoming = body?.tableIds;
    let tableIds: string[] = [];
    if (Array.isArray(incoming)) {
      tableIds = incoming as string[];
    } else if (typeof incoming === 'string') {
      tableIds = [incoming];
    }
    return this.seating.assignTables(id, tableIds);
  }

  private parseBoolean(value?: string | null) {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 240, burstLimit: 120 })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateReservationDto,
    @Headers('x-client-app') clientApp?: string,
  ) {
    const actor = this.resolveActor(clientApp);
    return this.reservations.update(id, body, actor);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: ReservationStatus },
    @Headers('x-client-app') clientApp?: string,
  ) {
    const actor = this.resolveActor(clientApp);
    return this.reservations.updateStatus(id, body.status, actor);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.reservations.remove(id);
  }

  private resolveActor(clientApp?: string): 'staff' | 'guest' {
    const normalized = (clientApp ?? '').trim().toLowerCase();
    if (normalized === 'booking-widget' || normalized === 'guest-widget') {
      return 'guest';
    }
    return 'staff';
  }
}

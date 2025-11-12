import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HoldStatus, Prisma, Venue } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { normalizeTimeTo24h, toUtcInstant } from './utils/time';
import { DEFAULT_VENUE_ID, ensureDefaultVenue } from './utils/default-venue';
import {
  findSlotConflicts,
  hasSlotConflicts,
  SlotConflicts,
} from './utils/booking-conflicts';
import { CacheService } from './cache/cache.service';

function clampTtlSeconds(ttl: unknown, fallback = 600, min = 60, max = 3600) {
  const num = Number(ttl);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

@Injectable()
export class HoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(params: { venueId?: string; date?: string } = {}) {
    const venueId = params.venueId?.trim() || DEFAULT_VENUE_ID;
    if (venueId === DEFAULT_VENUE_ID) {
      await ensureDefaultVenue(this.prisma);
    }
    const now = new Date();
    await this.prisma.hold.updateMany({
      where: {
        venueId,
        status: HoldStatus.HELD,
        expiresAt: { lte: now },
      },
      data: { status: HoldStatus.EXPIRED },
    });

    const where: Prisma.HoldWhereInput = {
      venueId,
      status: HoldStatus.HELD,
      expiresAt: { gt: now },
    };
    if (params.date) where.slotLocalDate = params.date;
    return this.prisma.hold.findMany({
      where,
      orderBy: [{ slotLocalDate: 'asc' }, { slotLocalTime: 'asc' }],
      include: { table: true },
    });
  }

  async create(input: {
    venueId?: string;
    date: string;
    time: string;
    partySize: number;
    tableId?: string | null;
    ttlSec?: number;
    createdBy?: string;
  }) {
    const requestedId = input.venueId?.trim() || DEFAULT_VENUE_ID;
    const venue =
      requestedId === DEFAULT_VENUE_ID
        ? await ensureDefaultVenue(this.prisma)
        : await this.prisma.venue.findUnique({ where: { id: requestedId } });
    if (!venue) throw new NotFoundException('Venue not found');

    const time = normalizeTimeTo24h(input.time);
    if (!time) throw new ConflictException('Invalid time format');

    if (!input.date) {
      throw new ConflictException('date is required');
    }
    const partySize = Number(input.partySize);
    if (!Number.isFinite(partySize) || partySize <= 0) {
      throw new ConflictException('Invalid party size');
    }

    const venueHoldTtlMinutes = Number(venue.holdTtlMin);
    const fallbackTtlSeconds =
      Number.isFinite(venueHoldTtlMinutes) && venueHoldTtlMinutes > 0
        ? Math.floor(venueHoldTtlMinutes * 60)
        : 600;
    const ttl = clampTtlSeconds(input.ttlSec, fallbackTtlSeconds);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const slotStartUtc = toUtcInstant(venue.timezone, {
      date: input.date,
      time,
    });
    const durationMinutes = this.resolveDurationMinutes(venue);

    const tableId = input.tableId ?? null;

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          if (tableId) {
            await this.assertTableInVenue(tx, venue.id, tableId);
          }

          await this.acquireSlotLock(tx, venue.id, input.date, time);

          const conflicts = await findSlotConflicts(tx, {
            venueId: venue.id,
            tableId,
            slotLocalDate: input.date,
            slotLocalTime: time,
            slotStartUtc,
            durationMinutes,
          });

          if (hasSlotConflicts(conflicts)) {
            return this.throwSlotConflict({
              venueId: venue.id,
              tableId,
              slotLocalDate: input.date,
              slotLocalTime: time,
              conflicts,
            });
          }

          const data: Prisma.HoldCreateInput = {
            status: HoldStatus.HELD,
            partySize: Math.round(partySize),
            slotLocalDate: input.date,
            slotLocalTime: time,
            slotStartUtc,
            expiresAt,
            createdBy: input.createdBy?.trim() || 'staff',
            venue: { connect: { id: venue.id } },
          };

          if (tableId) {
            data.table = { connect: { id: tableId } };
          }

          return tx.hold.create({
            data,
            include: { table: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await this.invalidateAvailabilityCache(venue.id, input.date);
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const conflicts = await this.prisma.$transaction((tx) =>
          findSlotConflicts(tx, {
            venueId: venue.id,
            tableId,
            slotLocalDate: input.date,
            slotLocalTime: time,
            slotStartUtc,
            durationMinutes,
          }),
        );
        return this.throwSlotConflict({
          venueId: venue.id,
          tableId,
          slotLocalDate: input.date,
          slotLocalTime: time,
          conflicts,
        });
      }
      throw error;
    }
  }

  async getValid(id: string) {
    const hold = await this.prisma.hold.findUnique({
      where: { id },
      include: { table: true },
    });
    if (!hold) return null;
    if (hold.status !== HoldStatus.HELD) return null;
    if (hold.expiresAt.getTime() <= Date.now()) {
      await this.prisma.hold.update({
        where: { id },
        data: { status: HoldStatus.EXPIRED },
      });
      return null;
    }
    return hold;
  }

  async consume(id: string, reservationId: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id } });
    if (!hold) throw new NotFoundException('Hold not found');
    if (hold.status !== HoldStatus.HELD) return hold;
    if (hold.expiresAt.getTime() <= Date.now()) {
      const expired = await this.prisma.hold.update({
        where: { id },
        data: { status: HoldStatus.EXPIRED },
      });
      await this.invalidateAvailabilityCache(hold.venueId, hold.slotLocalDate);
      return expired;
    }
    const consumed = await this.prisma.hold.update({
      where: { id },
      data: {
        status: HoldStatus.CONSUMED,
        reservation: { connect: { id: reservationId } },
      },
    });
    await this.invalidateAvailabilityCache(hold.venueId, hold.slotLocalDate);
    return consumed;
  }

  async cancel(id: string) {
    const hold = await this.prisma.hold.findUnique({
      where: { id },
      include: { table: true },
    });
    if (!hold) throw new NotFoundException('Hold not found');
    if (hold.status !== HoldStatus.HELD) return hold;
    const updated = await this.prisma.hold.update({
      where: { id },
      data: { status: HoldStatus.EXPIRED },
      include: { table: true },
    });
    await this.invalidateAvailabilityCache(hold.venueId, hold.slotLocalDate);
    return updated;
  }

  private throwSlotConflict(params: {
    venueId: string;
    tableId: string | null;
    slotLocalDate: string;
    slotLocalTime: string;
    conflicts: SlotConflicts;
  }): never {
    const details = {
      venueId: params.venueId,
      tableId: params.tableId,
      slotLocalDate: params.slotLocalDate,
      slotLocalTime: params.slotLocalTime,
      reservations: params.conflicts.reservations.map((reservation) => ({
        id: reservation.id,
        status: reservation.status,
        tableId: reservation.tableId,
        tableIds: reservation.tableIds,
        slotStartUtc: reservation.slotStartUtc.toISOString(),
        durationMinutes: reservation.durationMinutes,
      })),
      holds: params.conflicts.holds.map((hold) => ({
        id: hold.id,
        status: hold.status,
        tableId: hold.tableId,
        slotStartUtc: hold.slotStartUtc.toISOString(),
        expiresAt: hold.expiresAt.toISOString(),
      })),
    };

    throw new ConflictException({
      message: 'Requested slot is already booked',
      details,
    });
  }

  private resolveDurationMinutes(venue: Venue) {
    const fallback = Number(venue.defaultDurationMin);
    if (Number.isFinite(fallback) && fallback > 0) {
      return Math.round(fallback);
    }
    return 120;
  }

  private async assertTableInVenue(
    tx: Prisma.TransactionClient,
    venueId: string,
    tableId: string,
  ) {
    const match = await tx.table.findFirst({
      where: { id: tableId, venueId },
      select: { id: true },
    });
    if (!match) {
      throw new ConflictException('Table does not belong to venue');
    }
  }

  private buildSlotLockKey(venueId: string, date: string, time: string) {
    return `${venueId}::${date}::${time}`;
  }

  private async acquireSlotLock(
    tx: Prisma.TransactionClient,
    venueId: string,
    date: string,
    time: string,
  ) {
    const key = this.buildSlotLockKey(venueId, date, time);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  private async invalidateAvailabilityCache(venueId: string, date: string) {
    const normalizedVenue = venueId?.trim();
    const normalizedDate = date?.trim();
    if (!normalizedVenue || !normalizedDate) return;
    await this.cache.invalidateAvailability(normalizedVenue, normalizedDate);
  }
}

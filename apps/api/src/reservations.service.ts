import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommTemplateKind,
  HoldStatus,
  Prisma,
  ReservationStatus,
  Venue,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { normalizeTimeTo24h, toUtcInstant } from './utils/time';
import {
  BLOCKING_RESERVATION_STATUSES,
  findSlotConflicts,
  hasSlotConflicts,
  SlotConflicts,
} from './utils/booking-conflicts';
import {
  DEFAULT_VENUE_ID,
  ensureDefaultVenue,
} from './utils/default-venue';
import { syncReservationTableAssignments } from './utils/sync-table-assignments';
import { NotificationsService } from './notifications/notifications.service';
import { ReservationNotificationEvent } from './notifications/notification.types';
import { WebhooksService } from './webhooks/webhooks.service';
import { ReservationWebhookEvent } from './webhooks/webhook.types';
import { CacheService } from './cache/cache.service';
import { deriveEmailSearch, derivePhoneSearch } from './privacy/pii-crypto';
import { CommService, ReservationCommDetails } from './comms/comm.service';

const STATUS_CAST = new Set<ReservationStatus>([
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.SEATED,
  ReservationStatus.COMPLETED,
  ReservationStatus.CANCELLED,
]);

const STATUS_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.SEATED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.SEATED]: [
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.COMPLETED]: [],
  [ReservationStatus.CANCELLED]: [],
};

type ReservationRecord = Prisma.ReservationGetPayload<{
  include: {
    table: true;
    tables: { include: { table: true } };
    hold: { include: { table: true } };
    venue: true;
  };
}>;

type ReservationConflict = {
  reservations: Array<{
    id: string;
    code: string;
    status: ReservationStatus;
    tableId: string | null;
    tableIds: string[];
    slotLocalDate: string;
    slotLocalTime: string;
    slotStartUtc: string;
    durationMinutes: number | null;
  }>;
  holds: Array<{
    id: string;
    status: HoldStatus;
    tableId: string | null;
    slotLocalDate: string;
    slotLocalTime: string;
    slotStartUtc: string;
    expiresAt: string;
  }>;
};

type ReservationActor = 'staff' | 'guest';

export type ReservationDto = {
  id: string;
  venueId: string;
  code: string;
  status: ReservationStatus;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  durationMinutes: number;
  reminderSentAt: string | null;
  tableId: string | null;
  tableLabel: string | null;
  tableArea: string | null;
  tableCapacity: number | null;
  tables: Array<{
    tableId: string;
    label: string | null;
    capacity: number | null;
    area: string | null;
    zone: string | null;
    joinGroupId: string | null;
    order: number;
  }>;
  notes: string | null;
  channel: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  hold: null | {
    id: string;
    status: HoldStatus;
    tableId: string | null;
    tableLabel: string | null;
    tableArea: string | null;
    slotLocalDate: string;
    slotLocalTime: string;
    slotStartUtc: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    partySize: number;
  };
  conflicts: ReservationConflict;
};

type ListParams = {
  venueId?: string;
  date?: string;
  status?: ReservationStatus;
  tableId?: string;
  q?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  includeConflicts?: boolean;
};

type ListResult = {
  items: ReservationDto[];
  total: number;
};

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly comms: CommService,
    private readonly cache: CacheService,
  ) {}

  async list(params: ListParams = {}): Promise<ListResult> {
    const venue = await this.ensureVenue(params.venueId);
    const where: Prisma.ReservationWhereInput = { venueId: venue.id };
    const filters: Prisma.ReservationWhereInput[] = [];

    if (params.date) {
      where.slotLocalDate = params.date;
    }
    if (params.status) {
      where.status = params.status;
    }
    if (params.tableId) {
      filters.push({
        OR: [
          { tableId: params.tableId },
          { tables: { some: { tableId: params.tableId } } },
        ],
      });
    }
    if (params.q) {
      const term = params.q.trim();
      if (term) {
        const or: Prisma.ReservationWhereInput['OR'] = [
          { code: { contains: term, mode: 'insensitive' } },
          { guestName: { contains: term, mode: 'insensitive' } },
          { tableId: { contains: term, mode: 'insensitive' } },
        ];
        const emailSearch = deriveEmailSearch(term);
        if (emailSearch) {
          or.push({ guestEmailSearch: emailSearch });
        }
        const digits = term.replace(/\D+/g, '');
        if (digits) {
          if (digits.length <= 4) {
            or.push({ guestPhoneLast4: digits.slice(-4) });
          } else {
            const phoneSearch = derivePhoneSearch(term);
            if (phoneSearch.hash) {
              or.push({ guestPhoneSearch: phoneSearch.hash });
            }
            if (phoneSearch.last4) {
              or.push({ guestPhoneLast4: phoneSearch.last4 });
            }
          }
        }
        or.push({
          tables: {
            some: { tableId: { contains: term, mode: 'insensitive' } },
          },
        });
        filters.push({ OR: or });
      }
    }
    if (filters.length > 0) {
      const existingAnd = where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : [];
      where.AND = [...existingAnd, ...filters];
    }

    const limit = this.clamp(Number(params.limit) || 50, 1, 200);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = this.resolveOrderBy(params.sortBy, sortDir);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy,
        include: {
          table: true,
          tables: { include: { table: true } },
          hold: { include: { table: true } },
          venue: true,
        },
      }),
    ]);

    let conflictsMap: Map<string, ReservationConflict> | null = null;
    if (params.includeConflicts) {
      conflictsMap = await this.buildConflictMap(rows, venue.id);
    }

    const items = rows.map((row) =>
      this.toDto(row, conflictsMap?.get(row.id) ?? this.emptyConflict()),
    );

    return { items, total };
  }

  private async createFromHold(
    holdId: string,
    dto: CreateReservationDto,
  ) {
    if (!holdId) {
      throw new BadRequestException('holdId is required for this path');
    }

    const guestName = (dto.guest?.name ?? 'Walk-in').trim() || 'Walk-in';
    const guestPhone = dto.guest?.phone?.trim() || undefined;
    const guestEmail = dto.guest?.email?.trim() || undefined;
    const channel = dto.channel?.trim() || 'hold-convert';
    const createdBy = dto.createdBy?.trim() || 'system';
    const venueHint = dto.venueId?.trim();

    const holdMeta = await this.prisma.hold.findUnique({
      where: { id: holdId },
      select: { id: true, venueId: true },
    });
    if (!holdMeta) {
      throw new NotFoundException('Hold not found');
    }
    if (venueHint && venueHint !== holdMeta.venueId) {
      throw new BadRequestException('Hold belongs to a different venue');
    }

    const venue = await this.ensureVenue(holdMeta.venueId);
    const durationMinutes = this.resolveDurationMinutes(
      venue,
      dto.durationMinutes,
    );

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          const hold = await tx.hold.findUnique({
            where: { id: holdId },
            include: { table: true },
          });
          if (!hold) throw new NotFoundException('Hold not found');
          if (hold.venueId !== venue.id) {
            throw new BadRequestException('Hold belongs to a different venue');
          }

          const now = Date.now();
          if (hold.status !== HoldStatus.HELD) {
            throw new BadRequestException('Hold already consumed or expired');
          }
          if (hold.expiresAt.getTime() <= now) {
            await tx.hold.update({
              where: { id: hold.id },
              data: { status: HoldStatus.EXPIRED },
            });
            throw new BadRequestException('Hold expired');
          }

          if (dto.date && dto.date !== hold.slotLocalDate) {
            throw new BadRequestException('Hold date mismatch');
          }
          if (dto.time) {
            const normalized = normalizeTimeTo24h(dto.time);
            if (!normalized) throw new BadRequestException('Invalid time format');
            if (normalized !== hold.slotLocalTime) {
              throw new BadRequestException('Hold time mismatch');
            }
          }

          const overrideTableId =
            typeof dto.tableId === 'string' ? dto.tableId.trim() : undefined;
          const tableId = overrideTableId || hold.tableId;
          if (!tableId) {
            throw new BadRequestException(
              'Hold does not specify a table; provide tableId to convert',
            );
          }
          await this.assertTableInVenue(venue.id, tableId, tx);

          await this.acquireSlotLock(
            tx,
            venue.id,
            hold.slotLocalDate,
            hold.slotLocalTime,
          );

          await this.assertSlotIsFree(tx, {
            venueId: venue.id,
            tableId,
            slotLocalDate: hold.slotLocalDate,
            slotLocalTime: hold.slotLocalTime,
            slotStartUtc: hold.slotStartUtc,
            durationMinutes,
            excludeHoldId: hold.id,
          });

          const partySize = hold.partySize;
          const status = this.normalizeStatus(
            dto.status,
            ReservationStatus.CONFIRMED,
          );

          const newReservation = await tx.reservation.create({
            data: {
              code: this.generateCode(),
              status,
              guestName,
              guestPhone,
              guestEmail,
              partySize,
              slotLocalDate: hold.slotLocalDate,
              slotLocalTime: hold.slotLocalTime,
              slotStartUtc: hold.slotStartUtc,
              durationMinutes,
              notes: dto.notes?.trim() || undefined,
              channel,
              createdBy,
              venue: { connect: { id: venue.id } },
              table: { connect: { id: tableId } },
            },
          });
          await syncReservationTableAssignments(tx, newReservation.id, [tableId]);

          await tx.hold.update({
            where: { id: hold.id },
            data: {
              status: HoldStatus.CONSUMED,
              reservation: { connect: { id: newReservation.id } },
            },
          });

          const full = await tx.reservation.findUnique({
            where: { id: newReservation.id },
            include: {
              table: true,
              tables: { include: { table: true } },
              hold: { include: { table: true } },
              venue: true,
            },
          });
          if (!full) {
            throw new NotFoundException('Reservation not found after creation');
          }
          return full;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      const notificationEvents = this.resolveCreationEvents(created);
      const webhookEvents = this.resolveWebhookCreationEvents(created);

      await Promise.all([
        this.enqueueReservationNotifications(created, notificationEvents),
        this.enqueueReservationWebhooks(created, webhookEvents),
      ]);

      await this.invalidateAvailabilityForReservations(created);
      void this.dispatchReservationComm(CommTemplateKind.CONFIRM, created, {
        includeCalendar: true,
      });

      return this.toDto(created, this.emptyConflict());
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const summary = await this.prisma.$transaction(async (tx) => {
          const hold = await tx.hold.findUnique({
            where: { id: holdId },
            select: {
              id: true,
              tableId: true,
              slotLocalDate: true,
              slotLocalTime: true,
              slotStartUtc: true,
            },
          });
          if (!hold) return null;

          const tableId = dto.tableId ?? hold.tableId ?? null;
          const conflicts = await findSlotConflicts(tx, {
            venueId: venue.id,
            tableId,
            slotLocalDate: hold.slotLocalDate,
            slotLocalTime: hold.slotLocalTime,
            slotStartUtc: hold.slotStartUtc,
            durationMinutes,
            excludeHoldId: hold.id,
          });
          return {
            tableId,
            slotLocalDate: hold.slotLocalDate,
            slotLocalTime: hold.slotLocalTime,
            conflicts,
          };
        });

        if (summary) {
          return this.throwSlotConflict({
            venueId: venue.id,
            tableId: summary.tableId,
            tableIds: summary.tableId ? [summary.tableId] : null,
            slotLocalDate: summary.slotLocalDate,
            slotLocalTime: summary.slotLocalTime,
            conflicts: summary.conflicts,
          });
        }

        return this.throwSlotConflict({
          venueId: venue.id,
          tableId: dto.tableId ?? null,
          tableIds: dto.tableId ? [dto.tableId] : null,
          slotLocalDate: dto.date ?? 'unknown',
          slotLocalTime: dto.time ?? 'unknown',
          conflicts: { reservations: [], holds: [] },
        });
      }
      throw error;
    }
  }

  async get(id: string): Promise<ReservationDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        table: true,
        tables: { include: { table: true } },
        hold: { include: { table: true } },
        venue: true,
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return this.toDto(reservation, this.emptyConflict());
  }

  // ---------- CREATE ----------
  async create(dto: CreateReservationDto): Promise<ReservationDto> {
    const holdId = dto.holdId?.trim() || null;
    if (holdId) {
      return this.createFromHold(holdId, dto);
    }

    const venue = await this.ensureVenue(dto.venueId);
    const guestName = (dto.guest?.name ?? 'Walk-in').trim() || 'Walk-in';
    const guestPhone = dto.guest?.phone?.trim() || undefined;
    const guestEmail = dto.guest?.email?.trim() || undefined;
    const partySize = this.normalizePartySize(dto.partySize);
    const slot = this.buildSlot(venue, dto.date, dto.time);
    const durationMinutes = this.resolveDurationMinutes(
      venue,
      dto.durationMinutes,
    );
    const status = this.normalizeStatus(
      dto.status,
      ReservationStatus.CONFIRMED,
    );
    const channel = dto.channel?.trim() || 'staff-console';
    const createdBy = dto.createdBy?.trim() || 'system';
    const tableId =
      typeof dto.tableId === 'string' && dto.tableId.trim().length > 0
        ? dto.tableId.trim()
        : null;

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          if (tableId) {
            await this.assertTableInVenue(venue.id, tableId, tx);
          }

          await this.acquireSlotLock(tx, venue.id, slot.date, slot.time);

          await this.assertSlotIsFree(tx, {
            venueId: venue.id,
            tableId,
            slotLocalDate: slot.date,
            slotLocalTime: slot.time,
            slotStartUtc: slot.utc,
            durationMinutes,
          });

          const data: Prisma.ReservationCreateInput = {
            code: this.generateCode(),
            status,
            guestName,
            guestPhone,
            guestEmail,
            partySize,
            slotLocalDate: slot.date,
            slotLocalTime: slot.time,
            slotStartUtc: slot.utc,
            durationMinutes,
            notes: dto.notes?.trim() || undefined,
            channel,
            createdBy,
            venue: { connect: { id: venue.id } },
          };

          if (tableId) {
            data.table = { connect: { id: tableId } };
          }

          const newReservation = await tx.reservation.create({
            data,
          });
          await syncReservationTableAssignments(tx, newReservation.id, tableId ? [tableId] : []);

          const full = await tx.reservation.findUnique({
            where: { id: newReservation.id },
            include: {
              table: true,
              tables: { include: { table: true } },
              hold: { include: { table: true } },
              venue: true,
            },
          });
          if (!full) {
            throw new NotFoundException('Reservation not found after creation');
          }
          return full;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      const notificationEvents = this.resolveCreationEvents(created);
      const webhookEvents = this.resolveWebhookCreationEvents(created);

      await Promise.all([
        this.enqueueReservationNotifications(created, notificationEvents),
        this.enqueueReservationWebhooks(created, webhookEvents),
      ]);

      await this.invalidateAvailabilityForReservations(created);
      void this.dispatchReservationComm(CommTemplateKind.CONFIRM, created, {
        includeCalendar: true,
      });

      return this.toDto(created, this.emptyConflict());
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const conflicts = await this.prisma.$transaction((tx) =>
          findSlotConflicts(tx, {
            venueId: venue.id,
            tableId,
            slotLocalDate: slot.date,
            slotLocalTime: slot.time,
            slotStartUtc: slot.utc,
            durationMinutes,
          }),
        );
        return this.throwSlotConflict({
          venueId: venue.id,
          tableId,
          tableIds: tableId ? [tableId] : null,
          slotLocalDate: slot.date,
          slotLocalTime: slot.time,
          conflicts,
        });
      }
      throw error;
    }
  }

  // ---------- UPDATE ----------
  async update(
    id: string,
    dto: UpdateReservationDto,
    actor: ReservationActor = 'staff',
  ) {
    const existing = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        venue: true,
        hold: { include: { table: true } },
        table: true,
        tables: { include: { table: true } },
      },
    });
    if (!existing) throw new NotFoundException('Reservation not found');

    if (!dto || Object.keys(dto).length === 0) {
      return this.get(id);
    }

    if (actor === 'guest') {
      this.assertGuestUpdatePayload(dto);
      this.ensureGuestModifyWindow(existing.venue, existing.slotStartUtc);
      if (existing.status === ReservationStatus.CANCELLED) {
        throw new ForbiddenException('Reservation has already been cancelled');
      }
    }

    const payload: Prisma.ReservationUpdateInput = {};

    if (dto.guestName !== undefined) {
      const trimmedName =
        typeof dto.guestName === 'string' ? dto.guestName.trim() : '';
      payload.guestName =
        trimmedName.length > 0 ? trimmedName : existing.guestName;
    }
    if (dto.guestPhone !== undefined) {
      payload.guestPhone = dto.guestPhone?.trim() || null;
    }
    if (dto.guestEmail !== undefined) {
      payload.guestEmail = dto.guestEmail?.trim() || null;
    }
    if (dto.partySize !== undefined) {
      payload.partySize = this.normalizePartySize(dto.partySize);
    }
    if (dto.notes !== undefined) {
      payload.notes = dto.notes?.trim() || null;
    }
    if (dto.channel !== undefined) {
      payload.channel = dto.channel?.trim() || null;
    }

    const updatedStatus =
      dto.status !== undefined
        ? this.normalizeStatus(dto.status, existing.status)
        : existing.status;
    if (updatedStatus !== existing.status) {
      this.ensureTransition(existing.status, updatedStatus);
      payload.status = updatedStatus;
    }

    const nextTableId =
      dto.tableId !== undefined
        ? dto.tableId
          ? dto.tableId
          : null
        : existing.tableId ?? null;
    if (dto.tableId !== undefined) {
      if (nextTableId) {
        payload.table = { connect: { id: nextTableId } };
      } else {
        payload.table = { disconnect: true };
      }
    }

    const nextDurationMinutes =
      dto.durationMinutes !== undefined
        ? this.resolveDurationMinutes(existing.venue, dto.durationMinutes)
        : Number(existing.durationMinutes) || this.resolveDurationMinutes(existing.venue);
    if (dto.durationMinutes !== undefined) {
      payload.durationMinutes = nextDurationMinutes;
    }

    let slotDate = existing.slotLocalDate;
    let slotTime = existing.slotLocalTime;
    if (dto.date !== undefined) {
      slotDate = dto.date ?? existing.slotLocalDate;
    }
    if (dto.time !== undefined) {
      const normalized = normalizeTimeTo24h(dto.time);
      if (!normalized) throw new BadRequestException('Invalid time format');
      slotTime = normalized;
    }
    const slotChanged =
      dto.date !== undefined || dto.time !== undefined;
    if (slotChanged) {
      const slot = this.buildSlot(existing.venue, slotDate, slotTime);
      payload.slotLocalDate = slot.date;
      payload.slotLocalTime = slot.time;
      payload.slotStartUtc = slot.utc;
    }

    const needsConflictCheck =
      slotChanged || dto.tableId !== undefined || dto.durationMinutes !== undefined;

    const result = await this.prisma.$transaction(
      async (tx) => {
        if (nextTableId) {
          await this.assertTableInVenue(existing.venueId, nextTableId, tx);
        }

        const targetSlot = slotChanged
          ? this.buildSlot(existing.venue, slotDate, slotTime)
          : {
              date: existing.slotLocalDate,
              time: existing.slotLocalTime,
              utc: existing.slotStartUtc,
            };

        if (needsConflictCheck) {
          await this.acquireSlotLock(
            tx,
            existing.venueId,
            targetSlot.date,
            targetSlot.time,
          );
          await this.assertSlotIsFree(tx, {
            venueId: existing.venueId,
            tableId: nextTableId,
            slotLocalDate: targetSlot.date,
            slotLocalTime: targetSlot.time,
            slotStartUtc: targetSlot.utc,
            durationMinutes: nextDurationMinutes,
            excludeReservationId: id,
          });
        }

        await tx.reservation.update({
          where: { id },
          data: payload,
        });
        if (dto.tableId !== undefined) {
          await syncReservationTableAssignments(
            tx,
            id,
            nextTableId ? [nextTableId] : [],
          );
        }

        const updated = await tx.reservation.findUnique({
          where: { id },
          include: {
            table: true,
            tables: { include: { table: true } },
            hold: { include: { table: true } },
            venue: true,
          },
        });
        if (!updated) {
          throw new NotFoundException('Reservation not found after update');
        }
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const notificationEvents = this.resolveUpdateEvents(existing, result);
    const webhookEvents = this.resolveWebhookUpdateEvents(existing, result);

    await Promise.all([
      this.enqueueReservationNotifications(result, notificationEvents),
      this.enqueueReservationWebhooks(result, webhookEvents),
    ]);

    await this.invalidateAvailabilityForReservations(existing, result);
    if (
      existing.status !== ReservationStatus.CANCELLED &&
      result.status === ReservationStatus.CANCELLED
    ) {
      void this.dispatchReservationComm(CommTemplateKind.CANCELLED, result);
    }

    return this.toDto(result, this.emptyConflict());
  }

  async updateStatus(
    id: string,
    status: ReservationStatus,
    actor: ReservationActor = 'staff',
  ) {
    const existing = await this.prisma.reservation.findUnique({
      where: { id },
      include: { venue: true },
    });
    if (!existing) throw new NotFoundException('Reservation not found');
    const nextStatus = this.normalizeStatus(status, existing.status);
    this.ensureTransition(existing.status, nextStatus);

    if (
      actor === 'guest' &&
      nextStatus === ReservationStatus.CANCELLED
    ) {
      this.ensureGuestCancelWindow(existing.venue, existing.slotStartUtc);
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: nextStatus },
      include: {
        table: true,
        tables: { include: { table: true } },
        hold: { include: { table: true } },
        venue: true,
      },
    });
    const notificationEvents = this.resolveStatusEvents(existing.status, nextStatus);
    const webhookEvents = this.resolveWebhookStatusEvents(existing.status, nextStatus);

    await Promise.all([
      this.enqueueReservationNotifications(updated, notificationEvents),
      this.enqueueReservationWebhooks(updated, webhookEvents),
    ]);

    await this.invalidateAvailabilityForReservations(existing, updated);
    if (
      existing.status !== ReservationStatus.CANCELLED &&
      updated.status === ReservationStatus.CANCELLED
    ) {
      void this.dispatchReservationComm(CommTemplateKind.CANCELLED, updated);
    }

    return this.toDto(updated, this.emptyConflict());
  }

  async remove(id: string) {
    const existing = await this.prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        venueId: true,
        slotLocalDate: true,
      },
    });
    if (!existing) throw new NotFoundException('Reservation not found');
    await this.prisma.reservation.delete({ where: { id } });
    await this.invalidateAvailabilityForReservations(existing);
    return { ok: true };
  }

  // ---------- helpers ----------
  private async enqueueReservationNotifications(
    snapshot: ReservationRecord,
    events: ReservationNotificationEvent[],
    options: { scheduledAt?: Date | string | null; metadata?: Record<string, unknown> } = {},
  ) {
    if (events.length === 0) return;
    await this.notifications.enqueueReservationEvents(snapshot.id, events, {
      snapshot,
      scheduledAt: options.scheduledAt ?? null,
      metadata: options.metadata,
    });
  }

  private async enqueueReservationWebhooks(
    snapshot: ReservationRecord,
    events: ReservationWebhookEvent[],
  ) {
    if (events.length === 0) return;
    await this.webhooks.enqueueReservationEvents(snapshot, events);
  }

  private async invalidateAvailabilityForReservations(
    ...reservations: Array<{ venueId: string; slotLocalDate: string | null | undefined }>
  ) {
    const tasks: Promise<void>[] = [];
    const seen = new Set<string>();
    for (const entry of reservations) {
      const venueId = entry.venueId?.trim();
      const date = entry.slotLocalDate?.trim();
      if (!venueId || !date) continue;
      const key = `${venueId}::${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push(this.cache.invalidateAvailability(venueId, date));
    }
    if (tasks.length === 0) return;
    await Promise.all(tasks);
  }

  private resolveCommsBaseUrl(): string {
    const raw = process.env.COMMS_BASE_URL?.trim();
    if (!raw) {
      return 'https://example.test';
    }
    const normalized = raw.replace(/\s/g, '');
    return normalized.replace(/\/+$/, '') || 'https://example.test';
  }

  private buildReservationCommDetails(
    reservation: ReservationRecord,
  ): ReservationCommDetails {
    const baseUrl = this.resolveCommsBaseUrl();
    const manageUrl = `${baseUrl}/reservations/${reservation.code}`;
    const offerUrl = `${baseUrl}/offers/${reservation.venueId}`;
    return {
      id: reservation.id,
      code: reservation.code,
      guestName: reservation.guestName,
      partySize: reservation.partySize,
      slotStartUtc: reservation.slotStartUtc,
      durationMinutes: reservation.durationMinutes,
      venue: {
        id: reservation.venueId,
        name: reservation.venue.name,
        timezone: reservation.venue.timezone,
      },
      manageUrl,
      offerUrl,
    };
  }

  private async dispatchReservationComm(
    kind: CommTemplateKind,
    reservation: ReservationRecord,
    options: { includeCalendar?: boolean } = {},
  ) {
    if (!reservation.guestEmail) return;
    try {
      await this.comms.sendReservationEmail({
        kind,
        to: reservation.guestEmail,
        reservation: this.buildReservationCommDetails(reservation),
        includeCalendar: options.includeCalendar ?? false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(
        `Failed to send ${kind} email for reservation ${reservation.id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private resolveCreationEvents(
    reservation: ReservationRecord,
  ): ReservationNotificationEvent[] {
    const events: ReservationNotificationEvent[] = ['created'];
    if (reservation.status === ReservationStatus.CONFIRMED) {
      events.push('confirmed');
    } else if (reservation.status === ReservationStatus.CANCELLED) {
      events.push('cancelled');
    }
    return Array.from(new Set(events));
  }

  private resolveUpdateEvents(
    before: ReservationRecord,
    after: ReservationRecord,
  ): ReservationNotificationEvent[] {
    const events = this.resolveStatusEvents(before.status, after.status);
    if (this.hasReservationDetailsChanged(before, after)) {
      events.push('modified');
    }
    return Array.from(new Set(events));
  }

  private resolveStatusEvents(
    previous: ReservationStatus,
    next: ReservationStatus,
  ): ReservationNotificationEvent[] {
    if (previous === next) return [];
    const events: ReservationNotificationEvent[] = [];
    if (next === ReservationStatus.CONFIRMED) {
      events.push('confirmed');
    }
    if (next === ReservationStatus.CANCELLED) {
      events.push('cancelled');
    }
    return events;
  }

  private resolveWebhookCreationEvents(
    reservation: ReservationRecord,
  ): ReservationWebhookEvent[] {
    const events: ReservationWebhookEvent[] = ['reservation.created'];
    events.push(
      ...this.resolveWebhookStatusEvents(null, reservation.status),
    );
    return Array.from(new Set(events));
  }

  private resolveWebhookUpdateEvents(
    before: ReservationRecord,
    after: ReservationRecord,
  ): ReservationWebhookEvent[] {
    const events = this.resolveWebhookStatusEvents(
      before.status,
      after.status,
    );
    if (
      before.status === after.status &&
      this.hasReservationDetailsChanged(before, after)
    ) {
      events.push('reservation.updated');
    }
    return Array.from(new Set(events));
  }

  private resolveWebhookStatusEvents(
    previous: ReservationStatus | null,
    next: ReservationStatus,
  ): ReservationWebhookEvent[] {
    if (!next || previous === next) return [];
    const events: ReservationWebhookEvent[] = [];
    if (next === ReservationStatus.CANCELLED) {
      events.push('reservation.cancelled');
    }
    if (next === ReservationStatus.SEATED) {
      events.push('reservation.seated');
    }
    if (next === ReservationStatus.COMPLETED) {
      events.push('reservation.completed');
    }
    return events;
  }

  private hasReservationDetailsChanged(
    before: ReservationRecord,
    after: ReservationRecord,
  ): boolean {
    if (before.guestName !== after.guestName) return true;
    if (this.normalizeNullableString(before.guestEmail) !== this.normalizeNullableString(after.guestEmail)) {
      return true;
    }
    if (this.normalizeNullableString(before.guestPhone) !== this.normalizeNullableString(after.guestPhone)) {
      return true;
    }
    if (this.normalizeNullableString(before.notes) !== this.normalizeNullableString(after.notes)) {
      return true;
    }
    if (this.normalizeNullableString(before.channel) !== this.normalizeNullableString(after.channel)) {
      return true;
    }
    if (Number(before.partySize) !== Number(after.partySize)) return true;
    if (Number(before.durationMinutes) !== Number(after.durationMinutes)) {
      return true;
    }
    if (before.tableId !== after.tableId) return true;
    if (before.slotLocalDate !== after.slotLocalDate) return true;
    if (before.slotLocalTime !== after.slotLocalTime) return true;
    if (before.slotStartUtc.getTime() !== after.slotStartUtc.getTime()) {
      return true;
    }

    const beforeTables = before.tables
      .map((assignment) => assignment.tableId)
      .slice()
      .sort();
    const afterTables = after.tables
      .map((assignment) => assignment.tableId)
      .slice()
      .sort();
    if (beforeTables.length !== afterTables.length) return true;
    for (let index = 0; index < beforeTables.length; index += 1) {
      if (beforeTables[index] !== afterTables[index]) {
        return true;
      }
    }
    return false;
  }

  private normalizeNullableString(value: string | null): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private emptyConflict(): ReservationConflict {
    return { reservations: [], holds: [] };
  }

  private clamp(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private resolveOrderBy(
    sortBy: string | undefined,
    dir: 'asc' | 'desc',
  ): Prisma.ReservationOrderByWithRelationInput[] {
    const orders: Prisma.ReservationOrderByWithRelationInput[] = [];
    switch (sortBy) {
      case 'status':
        orders.push({ status: dir });
        break;
      case 'guest':
        orders.push({ guestName: dir });
        break;
      case 'date':
        orders.push({ slotLocalDate: dir }, { slotLocalTime: dir });
        break;
      case 'time':
        orders.push({ slotLocalTime: dir }, { slotLocalDate: dir });
        break;
      case 'party':
        orders.push({ partySize: dir });
        break;
      case 'table':
        orders.push({ tableId: dir });
        break;
      case 'code':
        orders.push({ code: dir });
        break;
      default:
        orders.push(
          { slotLocalDate: 'desc' },
          { slotLocalTime: 'desc' },
          { createdAt: 'desc' },
        );
        return orders;
    }
    orders.push(
      { slotLocalDate: 'desc' },
      { slotLocalTime: 'desc' },
      { createdAt: 'desc' },
    );
    return orders;
  }

  private async buildConflictMap(
    rows: ReservationRecord[],
    venueId: string,
  ): Promise<Map<string, ReservationConflict>> {
    if (rows.length === 0) return new Map();

    const entries = await Promise.all(
      rows.map(async (row) => {
        const targetDuration = Number(row.durationMinutes) || 120;
        const tableIds = new Set<string>();
        for (const assignment of row.tables) {
          tableIds.add(assignment.tableId);
        }
        if (row.tableId) {
          tableIds.add(row.tableId);
        }
        const conflictsRaw = await findSlotConflicts(this.prisma, {
          venueId,
          tableIds: Array.from(tableIds),
          slotLocalDate: row.slotLocalDate,
          slotLocalTime: row.slotLocalTime,
          slotStartUtc: row.slotStartUtc,
          durationMinutes: targetDuration,
          excludeReservationId: row.id,
        });
        const conflicts = this.emptyConflict();
        for (const res of conflictsRaw.reservations) {
          if (res.id === row.id) continue;
          conflicts.reservations.push({
            id: res.id,
            code: res.code ?? '',
            status: res.status,
            tableId: res.tableId,
            tableIds: res.tableIds,
            slotLocalDate: res.slotLocalDate,
            slotLocalTime: res.slotLocalTime,
            slotStartUtc: res.slotStartUtc.toISOString(),
            durationMinutes: res.durationMinutes,
          });
        }
        for (const hold of conflictsRaw.holds) {
          conflicts.holds.push({
            id: hold.id,
            status: hold.status,
            tableId: hold.tableId,
            slotLocalDate: hold.slotLocalDate,
            slotLocalTime: hold.slotLocalTime,
            slotStartUtc: hold.slotStartUtc.toISOString(),
            expiresAt: hold.expiresAt.toISOString(),
          });
        }

        return { id: row.id, conflicts };
      }),
    );

    return new Map(entries.map((entry) => [entry.id, entry.conflicts]));
  }

  private toDto(
    reservation: ReservationRecord,
    conflicts: ReservationConflict,
  ): ReservationDto {
    const durationMinutes = Number(reservation.durationMinutes) || 120;
    const assignedTables = reservation.tables
      .slice()
      .sort((a, b) => a.assignedOrder - b.assignedOrder)
      .map((assignment) => ({
        tableId: assignment.tableId,
        label: assignment.table?.label ?? null,
        capacity: assignment.table?.capacity ?? null,
        area: assignment.table?.area ?? null,
        zone: assignment.table?.zone ?? null,
        joinGroupId: assignment.table?.joinGroupId ?? null,
        order: assignment.assignedOrder,
      }));
    const primary =
      assignedTables[0] ??
      (reservation.tableId
        ? {
            tableId: reservation.tableId,
            label: reservation.table?.label ?? null,
            capacity: reservation.table?.capacity ?? null,
            area: reservation.table?.area ?? null,
            zone: reservation.table?.zone ?? null,
            joinGroupId: reservation.table?.joinGroupId ?? null,
            order: 0,
          }
        : null);
    return {
      id: reservation.id,
      venueId: reservation.venueId,
      code: reservation.code,
      status: reservation.status,
      guestName: reservation.guestName,
      guestPhone: reservation.guestPhone ?? null,
      guestEmail: reservation.guestEmail ?? null,
      partySize: reservation.partySize,
      slotLocalDate: reservation.slotLocalDate,
      slotLocalTime: reservation.slotLocalTime,
      slotStartUtc: reservation.slotStartUtc.toISOString(),
      durationMinutes,
      reminderSentAt: reservation.reminderSentAt
        ? reservation.reminderSentAt.toISOString()
        : null,
      tableId: primary?.tableId ?? null,
      tableLabel: primary?.label ?? null,
      tableArea: primary?.area ?? null,
      tableCapacity: primary?.capacity ?? null,
      tables: assignedTables,
      notes: reservation.notes ?? null,
      channel: reservation.channel ?? null,
      createdBy: reservation.createdBy ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
      hold: reservation.hold
        ? {
            id: reservation.hold.id,
            status: reservation.hold.status,
            tableId: reservation.hold.tableId ?? null,
            tableLabel: reservation.hold.table?.label ?? null,
            tableArea: reservation.hold.table?.area ?? null,
            slotLocalDate: reservation.hold.slotLocalDate,
            slotLocalTime: reservation.hold.slotLocalTime,
            slotStartUtc: reservation.hold.slotStartUtc.toISOString(),
            expiresAt: reservation.hold.expiresAt.toISOString(),
            createdAt: reservation.hold.createdAt.toISOString(),
            updatedAt: reservation.hold.updatedAt.toISOString(),
            partySize: reservation.hold.partySize,
          }
        : null,
      conflicts: {
        reservations: conflicts.reservations,
        holds: conflicts.holds,
      },
    };
  }

  private ensureGuestModifyWindow(venue: Venue, slotStartUtc: Date) {
    const windowMinutes = this.normalizeWindow(venue.guestCanModifyUntilMin, 0);
    if (windowMinutes <= 0) return;
    const remaining = this.minutesUntil(slotStartUtc);
    if (remaining < windowMinutes) {
      throw new ForbiddenException(
        'Reservation can no longer be modified online',
      );
    }
  }

  private ensureGuestCancelWindow(venue: Venue, slotStartUtc: Date) {
    const windowMinutes = this.normalizeWindow(venue.cancellationWindowMin, 0);
    if (windowMinutes <= 0) return;
    const remaining = this.minutesUntil(slotStartUtc);
    if (remaining < windowMinutes) {
      throw new ForbiddenException(
        'Reservation can no longer be cancelled online',
      );
    }
  }

  private assertGuestUpdatePayload(dto: UpdateReservationDto) {
    const forbidden: Array<keyof UpdateReservationDto> = [
      'status',
      'tableId',
      'partySize',
      'date',
      'time',
      'notes',
      'durationMinutes',
      'channel',
    ];
    for (const key of forbidden) {
      if (dto[key] !== undefined) {
        throw new ForbiddenException(
          'Guests may only update contact information',
        );
      }
    }
  }

  private minutesUntil(slotStartUtc: Date) {
    return (slotStartUtc.getTime() - Date.now()) / 60000;
  }

  private normalizeWindow(value: number | null | undefined, fallback: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return numeric < 0 ? 0 : Math.floor(numeric);
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

  private async assertSlotIsFree(
    tx: Prisma.TransactionClient,
    params: {
      venueId: string;
      tableId: string | null;
      tableIds?: string[] | null;
      slotLocalDate: string;
      slotLocalTime: string;
      slotStartUtc: Date;
      durationMinutes: number;
      excludeReservationId?: string | null;
      excludeHoldId?: string | null;
    },
  ) {
    const conflicts = await findSlotConflicts(tx, {
      venueId: params.venueId,
      tableId: params.tableId,
      tableIds: params.tableIds ?? null,
      slotLocalDate: params.slotLocalDate,
      slotLocalTime: params.slotLocalTime,
      slotStartUtc: params.slotStartUtc,
      durationMinutes: params.durationMinutes,
      excludeReservationId: params.excludeReservationId,
      excludeHoldId: params.excludeHoldId,
    });

    if (hasSlotConflicts(conflicts)) {
      return this.throwSlotConflict({
        venueId: params.venueId,
        tableId: params.tableId,
        tableIds: params.tableIds ?? null,
        slotLocalDate: params.slotLocalDate,
        slotLocalTime: params.slotLocalTime,
        conflicts,
      });
    }
  }

  private async ensureVenue(venueId?: string) {
    const id = venueId?.trim() || DEFAULT_VENUE_ID;
    if (id === DEFAULT_VENUE_ID) {
      return ensureDefaultVenue(this.prisma);
    }
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue) throw new NotFoundException(`Venue ${id} not found`);
    return venue;
  }

  private async assertTableInVenue(
    venueId: string,
    tableId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const match = await client.table.findFirst({
      where: { id: tableId, venueId },
      select: { id: true },
    });
    if (!match) throw new BadRequestException('Table does not belong to venue');
  }

  private normalizePartySize(value: unknown): number {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new BadRequestException('Invalid party size');
    }
    return Math.floor(number);
  }

  private buildSlot(venue: Venue, date?: string | null, time?: string | null) {
    if (!date) throw new BadRequestException('date is required');
    if (!time) throw new BadRequestException('time is required');

    const normalizedTime = normalizeTimeTo24h(time);
    if (!normalizedTime) {
      throw new BadRequestException('Invalid time format');
    }

    let utc: Date;
    try {
      utc = toUtcInstant(venue.timezone, { date, time: normalizedTime });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid date/time';
      throw new BadRequestException(message);
    }

    return {
      date,
      time: normalizedTime,
      utc,
    };
  }

  private resolveDurationMinutes(venue: Venue, requested?: number | null) {
    const value = Number(requested);
    if (Number.isFinite(value) && value > 0) return Math.round(value);

    const fallback = Number(venue.defaultDurationMin);
    if (Number.isFinite(fallback) && fallback > 0) {
      return Math.round(fallback);
    }
    return 120;
  }

  private ensureTransition(
    current: ReservationStatus,
    next: ReservationStatus,
  ) {
    if (current === next) return;
    const allowed = STATUS_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }

  private normalizeStatus(
    status?: string | null,
    fallback: ReservationStatus = ReservationStatus.PENDING,
  ): ReservationStatus {
    if (!status) return fallback;
    const upper = String(status).toUpperCase() as ReservationStatus;
    return STATUS_CAST.has(upper) ? upper : fallback;
  }

  private generateCode(length = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let token = '';
    for (let i = 0; i < length; i += 1) {
      token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return `R${token}`;
  }

  private throwSlotConflict(params: {
    venueId: string;
    slotLocalDate: string;
    slotLocalTime: string;
    tableId: string | null;
    tableIds?: string[] | null;
    conflicts: SlotConflicts;
  }): never {
    const details = {
      venueId: params.venueId,
      slotLocalDate: params.slotLocalDate,
      slotLocalTime: params.slotLocalTime,
      tableId: params.tableId,
      tableIds: params.tableIds ?? null,
      reservations: params.conflicts.reservations.map((reservation) => ({
        id: reservation.id,
        code: reservation.code,
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
}

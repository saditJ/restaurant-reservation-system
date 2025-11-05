import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityRule,
  BlackoutDate,
  HoldStatus,
  PacingRule,
  Prisma,
  ReservationStatus,
  ServiceBuffer,
  Shift,
  Table,
  Venue,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import type { PolicyEvaluation, PolicySlot } from './availability/policy.service';
import { AvailabilityPolicyService } from './availability/policy.service';
import {
  assertValidDate,
  normalizeTimeTo24h,
  toUtcInstant,
} from './utils/time';
import {
  DEFAULT_VENUE_ID,
  ensureDefaultVenue,
} from './utils/default-venue';
import {
  computeAvailability,
  type EngineInput,
  type AvailabilitySlot,
} from './availability/availability.engine';

type AvailabilityRequest = {
  venueId?: string;
  date: string;
  time: string;
  partySize: number;
  area?: string;
  tableId?: string;
};

type TableSummary = {
  id: string;
  label: string;
  capacity: number;
  area?: string | null;
  zone?: string | null;
  joinGroupId?: string | null;
};

type AvailabilityResponse = {
  requested: {
    venueId: string;
    date: string;
    time: string;
    partySize: number;
    durationMinutes: number;
  };
  tables: TableSummary[];
  stats: {
    total: number;
    available: number;
    blocked: number;
  };
  conflicts: {
    reservations: Array<{
      id: string;
      tableId: string | null;
      tableIds: string[];
      status: ReservationStatus;
      slotLocalDate: string;
      slotLocalTime: string;
      slotStartUtc: Date;
      durationMinutes: number;
      code: string;
    }>;
    holds: Array<{
      id: string;
      tableId: string | null;
      status: HoldStatus;
      slotLocalDate: string;
      slotLocalTime: string;
      slotStartUtc: Date;
      expiresAt: Date;
    }>;
  };
  policyHash: string;
  policySlots: PolicySlot[];
};

type VenueWithConfig = Venue & {
  shifts: Shift[];
  availabilityRules: AvailabilityRule[];
  blackoutDates: BlackoutDate[];
  pacingRules: PacingRule[];
  serviceBuffer: ServiceBuffer | null;
};

type ConflictBucket = {
  reservations: AvailabilityResponse['conflicts']['reservations'];
  holds: AvailabilityResponse['conflicts']['holds'];
};

const BLOCKING_RES_STATUS: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.SEATED,
];

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AvailabilityPolicyService,
  ) {}

  /**
   * Get availability using the DST-safe engine.
   * Returns time slots with capacity information across a date range.
   */
  async getAvailabilitySlots(params: {
    venueId?: string;
    startDate: string;
    endDate?: string;
    partySize: number;
    area?: string;
  }): Promise<{
    slots: AvailabilitySlot[];
    summary: {
      totalSlots: number;
      availableSlots: number;
      blockedSlots: number;
    };
  }> {
    const { venueId, startDate, endDate, partySize, area } = params;

    assertValidDate(startDate);
    if (endDate) assertValidDate(endDate);

    if (!Number.isFinite(partySize) || partySize <= 0) {
      throw new BadRequestException('partySize must be > 0');
    }

    const venue = await this.getVenueWithConfig(venueId);

    // Fetch reservations and holds for the date range
    const [reservations, holds] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          venueId: venue.id,
          slotLocalDate: {
            gte: startDate,
            lte: endDate || startDate,
          },
          status: { in: BLOCKING_RES_STATUS },
        },
        select: {
          id: true,
          tableId: true,
          slotStartUtc: true,
          durationMinutes: true,
          partySize: true,
          tables: { select: { tableId: true } },
        },
      }),
      this.prisma.hold.findMany({
        where: {
          venueId: venue.id,
          slotLocalDate: {
            gte: startDate,
            lte: endDate || startDate,
          },
          status: HoldStatus.HELD,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          tableId: true,
          slotStartUtc: true,
          expiresAt: true,
          partySize: true,
        },
      }),
    ]);

    // Map reservations to include tableIds
    const reservationsWithTables = reservations.map(({ tables, ...rest }) => ({
      ...rest,
      tableIds: [
        ...new Set(
          [
            rest.tableId ?? undefined,
            ...tables.map((assignment) => assignment.tableId),
          ].filter((value): value is string => !!value),
        ),
      ],
      durationMinutes: rest.durationMinutes || venue.defaultDurationMin || 120,
    }));

    // Fetch tables
    const whereTable: Prisma.TableWhereInput = {
      venueId: venue.id,
      capacity: { gte: partySize },
    };
    if (area) whereTable.area = area;

    const tables = await this.prisma.table.findMany({
      where: whereTable,
      orderBy: [{ capacity: 'asc' }, { label: 'asc' }],
    });

    // Build engine input
    const engineInput: EngineInput = {
      venue: {
        id: venue.id,
        timezone: venue.timezone,
        turnTimeMin: venue.turnTimeMin,
        defaultDurationMin: venue.defaultDurationMin,
      },
      dateRange: {
        startDate,
        endDate,
      },
      partySize,
      slotIntervalMinutes: 15,
      shifts: venue.shifts,
      availabilityRules: venue.availabilityRules,
      blackoutDates: venue.blackoutDates,
      pacingRules: venue.pacingRules,
      serviceBuffer: venue.serviceBuffer,
      tables,
      reservations: reservationsWithTables,
      holds,
    };

    return computeAvailability(engineInput);
  }

  async getAvailability(
    request: AvailabilityRequest,
    options: { policy?: PolicyEvaluation } = {},
  ): Promise<AvailabilityResponse> {
    const date = request.date?.trim();
    if (!date) throw new BadRequestException('date is required');
    assertValidDate(date);

    const normalizedTime = normalizeTimeTo24h(request.time);
    if (!normalizedTime) throw new BadRequestException('Invalid time format');
    const time = normalizedTime;

    const partySize = Number(request.partySize);
    if (!Number.isFinite(partySize) || partySize <= 0) {
      throw new BadRequestException('partySize must be > 0');
    }

    const venue = await this.getVenueWithConfig(request.venueId);
    const policyEvaluation =
      options.policy ??
      (await this.policy.evaluateDay({
        venueId: venue.id,
        date,
      }));
    const rule = this.pickRule(venue.availabilityRules, partySize);
    const defaultDuration = this.resolveDefaultDurationMinutes(venue);

    if (!rule) {
      return this.emptyAvailability(
        venue.id,
        date,
        time,
        partySize,
        defaultDuration,
        policyEvaluation,
      );
    }

    if (!this.isWithinShift(venue.shifts, date, time)) {
      return this.emptyAvailability(
        venue.id,
        date,
        time,
        partySize,
        rule.slotLengthMinutes,
        policyEvaluation,
      );
    }

    if (this.isBlackout(venue.blackoutDates, date)) {
      return this.emptyAvailability(
        venue.id,
        date,
        time,
        partySize,
        rule.slotLengthMinutes,
        policyEvaluation,
      );
    }

    const tables = await this.fetchTables(venue.id, partySize, {
      area: request.area,
      tableId: request.tableId,
    });
    if (request.tableId && tables.length === 0) {
      throw new NotFoundException('Table not found for venue');
    }

    if (tables.length === 0) {
      return this.emptyAvailability(
        venue.id,
        date,
        time,
        partySize,
        rule.slotLengthMinutes,
        policyEvaluation,
      );
    }

    const turnTimeMinutes = this.resolveTurnTimeMinutes(venue);
    const blockMinutes =
      rule.slotLengthMinutes + turnTimeMinutes + rule.bufferMinutes;
    const slotStartUtc = toUtcInstant(venue.timezone, { date, time });
    const slotEndUtc = new Date(slotStartUtc.getTime() + blockMinutes * 60_000);

    const now = new Date();
    const [reservationRows, holds] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          venueId: venue.id,
          slotLocalDate: date,
          status: { in: BLOCKING_RES_STATUS },
        },
        select: {
          id: true,
          tableId: true,
          status: true,
          slotLocalDate: true,
          slotLocalTime: true,
          slotStartUtc: true,
          durationMinutes: true,
          partySize: true,
          code: true,
          tables: { select: { tableId: true } },
        },
      }),
      this.prisma.hold.findMany({
        where: {
          venueId: venue.id,
          slotLocalDate: date,
          status: HoldStatus.HELD,
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          tableId: true,
          status: true,
          slotLocalDate: true,
          slotLocalTime: true,
          slotStartUtc: true,
          expiresAt: true,
          partySize: true,
        },
      }),
    ]);

    const reservations = reservationRows.map(({ tables, ...rest }) => ({
      ...rest,
      tableIds: [
        ...new Set(
          [
            rest.tableId ?? undefined,
            ...tables.map((assignment) => assignment.tableId),
          ].filter((value): value is string => !!value),
        ),
      ],
    }));

    const conflicts = this.buildConflicts({
      reservations,
      holds,
      slotStartUtc,
      slotEndUtc,
      rules: venue.availabilityRules,
      defaultRule: rule,
      turnTimeMinutes,
    });

    const availableTables = tables.filter(
      (table) => !conflicts.byTable.has(table.id),
    );

    const pacingLimit = this.resolvePacingLimit(venue);
    const bucket = this.bucketize(time);
    const pacingUsage = this.countPacingUsage(reservations, holds, bucket);
    let finalTables = availableTables;

    if (Number.isFinite(pacingLimit)) {
      const remaining = Math.max(Math.floor(pacingLimit - pacingUsage), 0);
      if (remaining <= 0) {
        finalTables = [];
      } else if (remaining < availableTables.length) {
        finalTables = availableTables.slice(0, remaining);
      }
    }

    const statsTotal = tables.length;
    const statsAvailable = finalTables.length;
    const statsBlocked = statsTotal - statsAvailable;

    return {
      requested: {
        venueId: venue.id,
        date,
        time,
        partySize,
        durationMinutes: rule.slotLengthMinutes,
      },
      tables: finalTables.map((table) => ({
        id: table.id,
        label: table.label,
        capacity: table.capacity,
        area: table.area,
        zone: table.zone,
        joinGroupId: table.joinGroupId,
      })),
      stats: {
        total: statsTotal,
        available: statsAvailable,
        blocked: statsBlocked,
      },
      conflicts: {
        reservations: conflicts.reservations,
        holds: conflicts.holds,
      },
      policyHash: policyEvaluation.policyHash,
      policySlots: policyEvaluation.slots,
    };
  }

  private async getVenueWithConfig(venueId?: string): Promise<VenueWithConfig> {
    const id = venueId?.trim() || DEFAULT_VENUE_ID;
    if (id === DEFAULT_VENUE_ID) {
      const venue = await ensureDefaultVenue(this.prisma);
      const [shifts, availabilityRules, blackoutDates, pacingRules, serviceBuffer] =
        await Promise.all([
          this.prisma.shift.findMany({ where: { venueId: id } }),
          this.prisma.availabilityRule.findMany({ where: { venueId: id } }),
          this.prisma.blackoutDate.findMany({ where: { venueId: id } }),
          this.prisma.pacingRule.findMany({ where: { venueId: id } }),
          this.prisma.serviceBuffer.findUnique({ where: { venueId: id } }),
        ]);
      return {
        ...venue,
        shifts,
        availabilityRules,
        blackoutDates,
        pacingRules,
        serviceBuffer,
      };
    }
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: {
        shifts: true,
        availabilityRules: true,
        blackoutDates: true,
        pacingRules: true,
        serviceBuffer: true,
      },
    });
    if (!venue) throw new NotFoundException(`Venue ${id} not found`);
    return venue;
  }

  private async fetchTables(
    venueId: string,
    partySize: number,
    filters: { area?: string; tableId?: string },
  ): Promise<Table[]> {
    const where: Prisma.TableWhereInput = {
      venueId,
      capacity: { gte: partySize },
    };
    if (filters.area) where.area = filters.area;
    if (filters.tableId) where.id = filters.tableId;

    return this.prisma.table.findMany({
      where,
      orderBy: [{ capacity: 'asc' }, { label: 'asc' }],
    });
  }

  private buildConflicts(params: {
    reservations: Array<{
      id: string;
      tableId: string | null;
      tableIds: string[];
      status: ReservationStatus;
      slotLocalDate: string;
      slotLocalTime: string;
      slotStartUtc: Date;
      durationMinutes: number | null;
      partySize: number;
      code: string;
    }>;
    holds: Array<{
      id: string;
      tableId: string | null;
      status: HoldStatus;
      slotLocalDate: string;
      slotLocalTime: string;
      slotStartUtc: Date;
      expiresAt: Date;
      partySize: number;
    }>;
    slotStartUtc: Date;
    slotEndUtc: Date;
    rules: AvailabilityRule[];
    defaultRule: AvailabilityRule;
    turnTimeMinutes: number;
  }): {
    byTable: Map<string, ConflictBucket>;
    reservations: AvailabilityResponse['conflicts']['reservations'];
    holds: AvailabilityResponse['conflicts']['holds'];
  } {
    const {
      reservations,
      holds,
      slotStartUtc,
      slotEndUtc,
      rules,
      defaultRule,
      turnTimeMinutes,
    } = params;

    const byTable = new Map<string, ConflictBucket>();
    const reservationConflicts: AvailabilityResponse['conflicts']['reservations'] =
      [];
    const holdConflicts: AvailabilityResponse['conflicts']['holds'] = [];

    for (const reservation of reservations) {
      const end = this.computeBlockEnd({
        slotStartUtc: reservation.slotStartUtc,
        explicitDuration: reservation.durationMinutes,
        partySize: reservation.partySize,
        rules,
        defaultRule,
        turnTimeMinutes,
      });
      if (!this.overlaps(reservation.slotStartUtc, end, slotStartUtc, slotEndUtc)) {
        continue;
      }

      const matchingRule =
        this.pickRule(rules, reservation.partySize) ?? defaultRule;
      const durationMinutes =
        reservation.durationMinutes && reservation.durationMinutes > 0
          ? reservation.durationMinutes
          : matchingRule.slotLengthMinutes;

      const conflict = {
        id: reservation.id,
        tableId: reservation.tableId,
        tableIds: reservation.tableIds,
        status: reservation.status,
        slotLocalDate: reservation.slotLocalDate,
        slotLocalTime: reservation.slotLocalTime,
        slotStartUtc: reservation.slotStartUtc,
        durationMinutes,
        code: reservation.code,
      };
      reservationConflicts.push(conflict);
      const linkedTables =
        reservation.tableIds.length > 0
          ? reservation.tableIds
          : reservation.tableId
          ? [reservation.tableId]
          : [];
      for (const tableId of linkedTables) {
        const bucket = byTable.get(tableId) ?? {
          reservations: [],
          holds: [],
        };
        bucket.reservations = [...bucket.reservations, conflict];
        byTable.set(tableId, bucket);
      }
    }

    for (const hold of holds) {
      const end = this.computeBlockEnd({
        slotStartUtc: hold.slotStartUtc,
        explicitDuration: null,
        partySize: hold.partySize,
        rules,
        defaultRule,
        turnTimeMinutes,
      });
      if (!this.overlaps(hold.slotStartUtc, end, slotStartUtc, slotEndUtc)) {
        continue;
      }

      const conflict = {
        id: hold.id,
        tableId: hold.tableId,
        status: hold.status,
        slotLocalDate: hold.slotLocalDate,
        slotLocalTime: hold.slotLocalTime,
        slotStartUtc: hold.slotStartUtc,
        expiresAt: hold.expiresAt,
      };
      holdConflicts.push(conflict);
      if (hold.tableId) {
        const bucket = byTable.get(hold.tableId) ?? {
          reservations: [],
          holds: [],
        };
        bucket.holds = [...bucket.holds, conflict];
        byTable.set(hold.tableId, bucket);
      }
    }

    return { byTable, reservations: reservationConflicts, holds: holdConflicts };
  }

  private computeBlockEnd(params: {
    slotStartUtc: Date;
    explicitDuration: number | null;
    partySize: number;
    rules: AvailabilityRule[];
    defaultRule: AvailabilityRule;
    turnTimeMinutes: number;
  }) {
    const { slotStartUtc, explicitDuration, partySize, rules, defaultRule, turnTimeMinutes } =
      params;
    const rule = this.pickRule(rules, partySize) ?? defaultRule;
    const baseDuration =
      explicitDuration && explicitDuration > 0
        ? explicitDuration
        : rule.slotLengthMinutes;
    const totalMinutes = baseDuration + turnTimeMinutes + rule.bufferMinutes;
    return new Date(slotStartUtc.getTime() + totalMinutes * 60_000);
  }

  private pickRule(rules: AvailabilityRule[], partySize: number) {
    let candidate: AvailabilityRule | null = null;
    for (const rule of rules) {
      if (partySize < rule.minPartySize || partySize > rule.maxPartySize) {
        continue;
      }
      if (!candidate) {
        candidate = rule;
        continue;
      }
      const candidateSpan = candidate.maxPartySize - candidate.minPartySize;
      const ruleSpan = rule.maxPartySize - rule.minPartySize;
      if (
        ruleSpan < candidateSpan ||
        (ruleSpan === candidateSpan && rule.minPartySize > candidate.minPartySize)
      ) {
        candidate = rule;
      }
    }
    return candidate;
  }

  private resolveDefaultDurationMinutes(venue: Venue) {
    const raw = Number(venue.defaultDurationMin);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 120;
  }

  private resolveTurnTimeMinutes(venue: VenueWithConfig) {
    const raw = Number(venue.turnTimeMin);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.round(raw);
  }

  private resolvePacingLimit(venue: VenueWithConfig) {
    const raw = Number(venue.pacingPerQuarterHour);
    if (!Number.isFinite(raw) || raw <= 0) return Number.POSITIVE_INFINITY;
    return Math.floor(raw);
  }

  private isWithinShift(shifts: Shift[], date: string, time: string) {
    if (shifts.length === 0) return false;
    const weekday = this.getWeekday(date);
    const minutes = this.timeToMinutes(time);

    const sameDay = shifts.filter((shift) => shift.dow === weekday);
    if (
      sameDay.some((shift) =>
        this.shiftContains(
          minutes,
          this.shiftTime(shift.startsAtLocal),
          this.shiftTime(shift.endsAtLocal),
        ),
      )
    ) {
      return true;
    }

    const previousDay = (weekday + 6) % 7;
    const wrappingShifts = shifts.filter((shift) => {
      if (shift.dow !== previousDay) return false;
      const start = this.timeToMinutes(this.shiftTime(shift.startsAtLocal));
      const end = this.timeToMinutes(this.shiftTime(shift.endsAtLocal));
      return end <= start;
    });

    return wrappingShifts.some((shift) =>
      this.shiftContains(
        minutes,
        '00:00',
        this.shiftTime(shift.endsAtLocal),
      ),
    );
  }

  private shiftContains(
    timeMinutes: number,
    start: string,
    end: string,
  ): boolean {
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    if (endMinutes > startMinutes) {
      return startMinutes <= timeMinutes && timeMinutes < endMinutes;
    }
    return timeMinutes >= startMinutes || timeMinutes < endMinutes;
  }

  private isBlackout(blackouts: BlackoutDate[], date: string) {
    for (const blackout of blackouts) {
      if (this.formatDate(blackout.date) === date) {
        return true;
      }
    }
    return false;
  }

  private getWeekday(date: string) {
    const [year, month, day] = date.split('-').map((part) => Number(part));
    const utc = Date.UTC(year, month - 1, day);
    return new Date(utc).getUTCDay();
  }

  private bucketize(time: string, stepMinutes = 15): string {
    const minutes = this.timeToMinutes(time);
    const bucket = Math.floor(minutes / stepMinutes) * stepMinutes;
    const hours = Math.floor(bucket / 60);
    const mins = bucket % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  private countPacingUsage(
    reservations: Array<{ slotLocalTime: string }>,
    holds: Array<{ slotLocalTime: string }>,
    bucket: string,
  ) {
    const countMatches = (entries: Array<{ slotLocalTime: string }>) =>
      entries.filter(
        (entry) => this.bucketize(entry.slotLocalTime) === bucket,
      ).length;
    return countMatches(reservations) + countMatches(holds);
  }

  private timeToMinutes(time: string) {
    const [hours, minutes] = time.split(':').map((part) => Number(part));
    return hours * 60 + minutes;
  }

  private shiftTime(value: Date) {
    const hours = value.getUTCHours();
    const minutes = value.getUTCMinutes();
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && bStart < aEnd;
  }

  private emptyAvailability(
    venueId: string,
    date: string,
    time: string,
    partySize: number,
    durationMinutes: number,
    policy: PolicyEvaluation,
  ): AvailabilityResponse {
    return {
      requested: {
        venueId,
        date,
        time,
        partySize,
        durationMinutes,
      },
      tables: [],
      stats: {
        total: 0,
        available: 0,
        blocked: 0,
      },
      conflicts: {
        reservations: [],
        holds: [],
      },
      policyHash: policy.policyHash,
      policySlots: policy.slots,
    };
  }
}

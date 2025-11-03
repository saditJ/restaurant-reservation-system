import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Temporal } from '@js-temporal/polyfill';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics/metrics.service';

type ShiftLike = {
  id: string;
  dow: number;
  startsAtLocal: Date;
  endsAtLocal: Date;
  capacitySeats: number;
  capacityCovers: number;
  isActive: boolean;
  updatedAt: Date;
};

type PacingRuleLike = {
  id: string;
  windowMinutes: number;
  maxReservations: number | null;
  maxCovers: number | null;
  updatedAt: Date;
};

type ServiceBufferLike = {
  beforeMinutes: number;
  afterMinutes: number;
  updatedAt: Date;
};

type BlackoutDateLike = {
  id: string;
  date: Date;
  reason: string | null;
  updatedAt: Date;
};

export type PolicySlot = {
  startUtc: Date;
  endUtc: Date;
  capacity: number;
  remaining: number;
  reason?: string;
};

export type PolicyEvaluation = {
  slots: PolicySlot[];
  policyHash: string;
};

type GenerateSlotsArgs = {
  date: string;
  timezone: string;
  shifts: ShiftLike[];
  windowMinutes: number;
  buffer: { beforeMinutes: number; afterMinutes: number };
};

type TemporalSlot = {
  shiftId: string;
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
};

const DEFAULT_TIMEZONE = 'Europe/Tirane';

@Injectable()
export class AvailabilityPolicyService {
  private readonly logger = new Logger(AvailabilityPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async evaluateDay(params: {
    venueId: string;
    date: string;
  }): Promise<PolicyEvaluation> {
    const { venueId, date } = params;
    const parsedDate = this.safeParseDate(date);
    const blackoutWindow = this.buildBlackoutQueryRange(parsedDate);

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        timezone: true,
        shifts: {
          where: { isActive: true },
          orderBy: [
            { dow: 'asc' },
            { startsAtLocal: 'asc' },
            { id: 'asc' },
          ],
        },
        pacingRules: {
          orderBy: [
            { windowMinutes: 'asc' },
            { id: 'asc' },
          ],
        },
        blackoutDates: {
          where: {
            date: {
              gte: blackoutWindow.start,
              lt: blackoutWindow.end,
            },
          },
          orderBy: { id: 'asc' },
        },
        serviceBuffer: true,
      },
    });

    if (!venue) {
      this.logger.warn(
        `Attempted to evaluate availability policy for unknown venue "${venueId}"`,
      );
      return {
        slots: [],
        policyHash: this.computePolicyHash({
          shifts: [],
          pacingRules: [],
          blackoutDates: [],
          serviceBuffer: null,
        }),
      };
    }

    const timezone = venue.timezone?.trim() || DEFAULT_TIMEZONE;
    const serviceBuffer = venue.serviceBuffer
      ? {
          beforeMinutes: Math.max(0, venue.serviceBuffer.beforeMinutes),
          afterMinutes: Math.max(0, venue.serviceBuffer.afterMinutes),
          updatedAt: venue.serviceBuffer.updatedAt,
        }
      : {
          beforeMinutes: 0,
          afterMinutes: 0,
          updatedAt: new Date(0),
        };

    const policyHash = this.computePolicyHash({
      shifts: venue.shifts,
      pacingRules: venue.pacingRules,
      blackoutDates: venue.blackoutDates,
      serviceBuffer,
    });

    this.metrics.incrementAvailabilityPolicyEval(venueId);

    if (venue.blackoutDates.length > 0) {
      const blackoutSlot = this.buildBlackoutSlot(parsedDate, timezone);
      return {
        slots: [blackoutSlot],
        policyHash,
      };
    }

    const windowMinutes =
      venue.pacingRules[0]?.windowMinutes ??
      (venue.shifts.length > 0 ? 15 : 0);
    if (windowMinutes <= 0 || venue.shifts.length === 0) {
      return {
        slots: [],
        policyHash,
      };
    }

    const slots = generatePolicySlots({
      date,
      timezone,
      shifts: venue.shifts,
      windowMinutes,
      buffer: {
        beforeMinutes: serviceBuffer.beforeMinutes,
        afterMinutes: serviceBuffer.afterMinutes,
      },
    }).map<PolicySlot>((slot) => {
      const capacity = this.resolveCapacityForShift(
        slot.shiftId,
        venue.shifts,
        venue.pacingRules,
      );
      return {
        startUtc: instantToDate(slot.start.toInstant()),
        endUtc: instantToDate(slot.end.toInstant()),
        capacity,
        remaining: capacity,
      };
    });

    return {
      slots,
      policyHash,
    };
  }

  private resolveCapacityForShift(
    shiftId: string,
    shifts: ShiftLike[],
    pacingRules: PacingRuleLike[],
  ) {
    const shift = shifts.find((item) => item.id === shiftId);
    if (!shift) return 0;
    const rule = pacingRules[0];
    const reservationCap = rule?.maxReservations ?? shift.capacitySeats;
    const coverCap = rule?.maxCovers ?? shift.capacityCovers;
    const positiveReservation = Number.isFinite(reservationCap)
      ? Math.max(0, reservationCap)
      : 0;
    const positiveCover = Number.isFinite(coverCap)
      ? Math.max(0, coverCap)
      : 0;
    return positiveReservation || positiveCover;
  }

  private safeParseDate(value: string) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error(`Invalid date format "${value}", expected YYYY-MM-DD`);
    }
    const [year, month, day] = match.slice(1).map((part) => Number(part));
    return Temporal.PlainDate.from({ year, month, day });
  }

  private buildBlackoutQueryRange(date: Temporal.PlainDate) {
    const start = Temporal.ZonedDateTime.from({
      timeZone: DEFAULT_TIMEZONE,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    }).toInstant();
    const end = date.add({ days: 1 });
    const endInstant = Temporal.ZonedDateTime.from({
      timeZone: DEFAULT_TIMEZONE,
      year: end.year,
      month: end.month,
      day: end.day,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    }).toInstant();

    return {
      start: instantToDate(start),
      end: instantToDate(endInstant),
    };
  }

  private buildBlackoutSlot(
    date: Temporal.PlainDate,
    timezone: string,
  ): PolicySlot {
    const tz = Temporal.TimeZone.from(timezone) as Temporal.TimeZone;
    const startInstant = tz
      .getInstantFor(
        date.toPlainDateTime(Temporal.PlainTime.from('00:00')),
        { disambiguation: 'compatible' },
      )
      .toZonedDateTimeISO(timezone);
    const endInstant = startInstant.add({ days: 1 });
    return {
      startUtc: instantToDate(startInstant.toInstant()),
      endUtc: instantToDate(endInstant.toInstant()),
      capacity: 0,
      remaining: 0,
      reason: 'blackout',
    };
  }

  private computePolicyHash(input: {
    shifts: ShiftLike[];
    pacingRules: PacingRuleLike[];
    blackoutDates: BlackoutDateLike[];
    serviceBuffer: ServiceBufferLike | null;
  }) {
    const payload = {
      v: 1,
      shifts: [...input.shifts]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((shift) => ({
          id: shift.id,
          dow: shift.dow,
          startsAt: formatTime(shift.startsAtLocal),
          endsAt: formatTime(shift.endsAtLocal),
          capacitySeats: shift.capacitySeats,
          capacityCovers: shift.capacityCovers,
          isActive: shift.isActive,
          updatedAt: shift.updatedAt.toISOString(),
        })),
      pacingRules: [...input.pacingRules]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((rule) => ({
          id: rule.id,
          windowMinutes: rule.windowMinutes,
          maxReservations: rule.maxReservations,
          maxCovers: rule.maxCovers,
          updatedAt: rule.updatedAt.toISOString(),
        })),
      blackoutDates: [...input.blackoutDates]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => ({
          id: item.id,
          date: item.date.toISOString().slice(0, 10),
          reason: item.reason ?? null,
          updatedAt: item.updatedAt.toISOString(),
        })),
      serviceBuffer: input.serviceBuffer
        ? {
            beforeMinutes: input.serviceBuffer.beforeMinutes,
            afterMinutes: input.serviceBuffer.afterMinutes,
            updatedAt: input.serviceBuffer.updatedAt.toISOString(),
          }
        : null,
    };

    return createHash('sha1')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 16);
  }
}

export function generatePolicySlots(args: GenerateSlotsArgs): TemporalSlot[] {
  const { date, timezone, shifts, windowMinutes, buffer } = args;
  if (windowMinutes <= 0) return [];
  const tz = Temporal.TimeZone.from(timezone) as Temporal.TimeZone;
  const day = Temporal.PlainDate.from(date);

  const dayStart = tz
    .getInstantFor(
      day.toPlainDateTime(Temporal.PlainTime.from('00:00')),
      { disambiguation: 'compatible' },
    )
    .toZonedDateTimeISO(timezone);
  const dayEnd = dayStart.add({ days: 1 });

  const relevantShifts = determineRelevantShifts(shifts, day);

  const slots: TemporalSlot[] = [];
  for (const { shift, startDate } of relevantShifts) {
    const startTime = formatTime(shift.startsAtLocal);
    const endTime = formatTime(shift.endsAtLocal);
    const startPlain = startDate.toPlainDateTime(
      Temporal.PlainTime.from(startTime),
    );
    const startZdt = tz
      .getInstantFor(startPlain, { disambiguation: 'compatible' })
      .toZonedDateTimeISO(timezone);

    const wraps = wrapsOvernight(shift);
    const endDate = wraps ? startDate.add({ days: 1 }) : startDate;
    const endPlain = endDate.toPlainDateTime(Temporal.PlainTime.from(endTime));
    const rawEndZdt = tz
      .getInstantFor(endPlain, { disambiguation: 'compatible' })
      .toZonedDateTimeISO(timezone);

    const clippedStart = Temporal.ZonedDateTime.compare(startZdt, dayStart) < 0
      ? dayStart
      : startZdt;
    const clippedEnd = Temporal.ZonedDateTime.compare(rawEndZdt, dayEnd) > 0
      ? dayEnd
      : rawEndZdt;

    let windowStart = clippedStart.add({
      minutes: buffer.beforeMinutes ?? 0,
    });
    let windowEnd = clippedEnd.subtract({
      minutes: buffer.afterMinutes ?? 0,
    });

    if (
      Temporal.ZonedDateTime.compare(windowStart, dayStart) < 0
    ) {
      windowStart = dayStart;
    }
    if (
      Temporal.ZonedDateTime.compare(windowEnd, dayStart) < 0 ||
      Temporal.ZonedDateTime.compare(windowEnd, windowStart) <= 0
    ) {
      continue;
    }
    if (
      Temporal.ZonedDateTime.compare(windowEnd, dayEnd) > 0
    ) {
      windowEnd = dayEnd;
    }

    let current = windowStart;
    while (Temporal.ZonedDateTime.compare(current, windowEnd) < 0) {
      const next = current.add({ minutes: windowMinutes });
      if (Temporal.ZonedDateTime.compare(next, windowEnd) > 0) {
        break;
      }
      slots.push({
        shiftId: shift.id,
        start: current,
        end: next,
      });
      current = next;
    }
  }

  return slots.sort((a, b) =>
    Temporal.Instant.compare(
      a.start.toInstant(),
      b.start.toInstant(),
    ),
  );
}

function determineRelevantShifts(
  shifts: ShiftLike[],
  day: Temporal.PlainDate,
) {
  const weekday = day.dayOfWeek % 7;
  const previous = ((weekday + 6) % 7) as number;

  const relevant: Array<{ shift: ShiftLike; startDate: Temporal.PlainDate }> =
    [];
  for (const shift of shifts) {
    if (!shift.isActive) continue;
    if (shift.dow === weekday) {
      relevant.push({ shift, startDate: day });
      continue;
    }
    if (shift.dow === previous && wrapsOvernight(shift)) {
      relevant.push({ shift, startDate: day.subtract({ days: 1 }) });
    }
  }
  return relevant;
}

export function wrapsOvernight(shift: ShiftLike) {
  const startMinutes = timeStringToMinutes(formatTime(shift.startsAtLocal));
  const endMinutes = timeStringToMinutes(formatTime(shift.endsAtLocal));
  return endMinutes <= startMinutes;
}

export function calculatePacingWindow(
  startUtc: Date,
  windowMinutes: number,
): { startUtc: Date; endUtc: Date } {
  const startInstant = Temporal.Instant.from(startUtc.toISOString());
  const endInstant = startInstant.add({ minutes: windowMinutes });
  return {
    startUtc: instantToDate(startInstant),
    endUtc: instantToDate(endInstant),
  };
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
) {
  const aS = Temporal.Instant.from(aStart.toISOString());
  const aE = Temporal.Instant.from(aEnd.toISOString());
  const bS = Temporal.Instant.from(bStart.toISOString());
  const bE = Temporal.Instant.from(bEnd.toISOString());
  return Temporal.Instant.compare(aS, bE) < 0 &&
    Temporal.Instant.compare(bS, aE) < 0;
}

function formatTime(input: Date) {
  const hours = input.getUTCHours();
  const minutes = input.getUTCMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeStringToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return hours * 60 + minutes;
}

function instantToDate(instant: Temporal.Instant) {
  return new Date(Number(instant.epochMilliseconds));
}

import { AvailabilityService } from './availability.service';
import type { PrismaService } from './prisma.service';
import { HoldStatus, ReservationStatus } from '@prisma/client';
import { toUtcInstant } from './utils/time';

type MockedPrisma = {
  venue: { findUnique: jest.Mock };
  table: { findMany: jest.Mock };
  reservation: { findMany: jest.Mock };
  hold: { findMany: jest.Mock };
};

const VENUE_ID = 'venue-test';

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function timeAsDate(time: string) {
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function expandBlackoutRange(start: string, end: string) {
  const dates: Date[] = [];
  const cursor = dateOnly(start);
  const limit = dateOnly(end);
  while (cursor <= limit) {
    dates.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function makeVenue(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2024-01-01T00:00:00Z');
  const {
    shifts: overrideShifts,
    blackouts: overrideBlackouts,
    blackoutDates: overrideBlackoutDates,
    pacingRules: overridePacingRules,
    serviceBuffer: overrideServiceBuffer,
    ...rest
  } = overrides;

  const rawShifts: Array<Record<string, unknown>> = Array.isArray(
    overrideShifts,
  )
    ? overrideShifts
    : [
        {
          id: 'shift-1',
          venueId: VENUE_ID,
          dayOfWeek: 4,
          startLocalTime: '18:00',
          endLocalTime: '22:00',
          capacitySeats: 40,
          capacityCovers: 160,
          isActive: true,
        },
      ];

  const shifts = rawShifts.map((shift, index) => {
    const start = (shift as any).startsAt ?? (shift as any).startLocalTime;
    const end = (shift as any).endsAt ?? (shift as any).endLocalTime;
    return {
      id: (shift as any).id ?? `shift-${index + 1}`,
      venueId: (shift as any).venueId ?? VENUE_ID,
      dow: (shift as any).dow ?? (shift as any).dayOfWeek ?? 0,
      startsAtLocal:
        (shift as any).startsAtLocal instanceof Date
          ? (shift as any).startsAtLocal
          : timeAsDate(typeof start === 'string' ? start : '18:00'),
      endsAtLocal:
        (shift as any).endsAtLocal instanceof Date
          ? (shift as any).endsAtLocal
          : timeAsDate(typeof end === 'string' ? end : '22:00'),
      capacitySeats: (shift as any).capacitySeats ?? 40,
      capacityCovers: (shift as any).capacityCovers ?? 160,
      isActive: (shift as any).isActive ?? true,
      createdAt: (shift as any).createdAt ?? createdAt,
      updatedAt: (shift as any).updatedAt ?? createdAt,
    };
  });

  const blackoutDates: Array<{
    id: string;
    venueId: string;
    date: Date;
    reason?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = Array.isArray(overrideBlackoutDates)
    ? overrideBlackoutDates.map((entry: any, index: number) => ({
        id: entry.id ?? `blackout-date-${index + 1}`,
        venueId: entry.venueId ?? VENUE_ID,
        date: entry.date instanceof Date ? entry.date : dateOnly(entry.date),
        reason: entry.reason ?? null,
        createdAt: entry.createdAt ?? createdAt,
        updatedAt: entry.updatedAt ?? createdAt,
      }))
    : Array.isArray(overrideBlackouts)
      ? overrideBlackouts.flatMap((entry: any, index: number) =>
          expandBlackoutRange(entry.startDate, entry.endDate).map(
            (date, innerIndex) => ({
              id: `blackout-${index + 1}-${innerIndex + 1}`,
              venueId: entry.venueId ?? VENUE_ID,
              date,
              reason: entry.reason ?? null,
              createdAt: entry.createdAt ?? createdAt,
              updatedAt: entry.updatedAt ?? createdAt,
            }),
          ),
        )
      : [];

  const pacingRules = Array.isArray(overridePacingRules)
    ? overridePacingRules
    : [];

  const serviceBuffer = overrideServiceBuffer ?? null;

  return {
    id: VENUE_ID,
    name: 'Test Venue',
    timezone: 'Europe/Tirane',
    hours: null,
    turnTimeMin: 10,
    holdTtlMin: 15,
    defaultDurationMin: 120,
    cancellationWindowMin: 120,
    guestCanModifyUntilMin: 120,
    noShowFeePolicy: false,
    pacingPerQuarterHour: 4,
    createdAt,
    updatedAt: createdAt,
    availabilityRules: [
      {
        id: 'rule-1',
        venueId: VENUE_ID,
        minPartySize: 1,
        maxPartySize: 6,
        slotLengthMinutes: 90,
        bufferMinutes: 15,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    shifts,
    blackoutDates,
    pacingRules,
    serviceBuffer,
    ...rest,
  };
}

function sampleTables(count: number) {
  return Array.from({ length: count }).map((_, index) => ({
    id: `T${index + 1}`,
    venueId: VENUE_ID,
    label: `T${index + 1}`,
    capacity: index < 2 ? 2 : 4,
    area: 'Main',
    x: null,
    y: null,
    width: null,
    height: null,
    metadata: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }));
}

describe('AvailabilityService', () => {
  let prisma: MockedPrisma;
  let service: AvailabilityService;
  let policy: { evaluateDay: jest.Mock };

  beforeEach(() => {
    prisma = {
      venue: { findUnique: jest.fn() },
      table: { findMany: jest.fn() },
      reservation: { findMany: jest.fn() },
      hold: { findMany: jest.fn() },
    };
    policy = {
      evaluateDay: jest.fn(({ date }) =>
        Promise.resolve({ policyHash: `policy-${date}`, slots: [] }),
      ),
    };
    service = new AvailabilityService(
      prisma as unknown as PrismaService,
      policy as unknown as any,
    );
  });

  it('returns availability at opening edge but not past closing', async () => {
    const date = '2025-10-16';
    const venue = makeVenue({
      shifts: [
        {
          id: 'shift-edge',
          venueId: VENUE_ID,
          dayOfWeek: weekday(date),
          startLocalTime: '18:00',
          endLocalTime: '22:00',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
    });
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.table.findMany.mockImplementation(() =>
      Promise.resolve(sampleTables(2)),
    );
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.hold.findMany.mockResolvedValue([]);

    const opening = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '18:00',
      partySize: 2,
    });
    expect(opening.tables).toHaveLength(2);
    expect(opening.stats.available).toBe(2);

    const closing = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '22:00',
      partySize: 2,
    });
    expect(closing.tables).toHaveLength(0);
    expect(closing.stats.available).toBe(0);
  });

  it('respects buffers when evaluating overlapping reservations', async () => {
    const date = '2025-10-17';
    const venue = makeVenue({
      shifts: [
        {
          id: 'shift-buffer',
          venueId: VENUE_ID,
          dayOfWeek: weekday(date),
          startLocalTime: '18:00',
          endLocalTime: '23:00',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
      availabilityRules: [
        {
          id: 'rule-buffer',
          venueId: VENUE_ID,
          minPartySize: 1,
          maxPartySize: 6,
          slotLengthMinutes: 90,
          bufferMinutes: 20,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
    });
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.table.findMany.mockImplementation(() =>
      Promise.resolve(sampleTables(1)),
    );
    prisma.reservation.findMany.mockImplementation(() =>
      Promise.resolve([
        {
          id: 'res-1',
          tableId: 'T1',
          status: ReservationStatus.CONFIRMED,
          slotLocalDate: date,
          slotLocalTime: '18:00',
          slotStartUtc: toUtcInstant(venue.timezone, {
            date,
            time: '18:00',
          }),
          durationMinutes: 90,
          partySize: 2,
          code: 'R1',
          tables: [],
        },
      ]),
    );
    prisma.hold.findMany.mockResolvedValue([]);

    const duringBuffer = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '19:45',
      partySize: 2,
    });
    expect(duringBuffer.tables).toHaveLength(0);

    const afterBuffer = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '20:30',
      partySize: 2,
    });
    expect(afterBuffer.tables).toHaveLength(1);
  });

  it('enforces pacing caps while leaving later slots available', async () => {
    const date = '2025-10-18';
    const venue = makeVenue({
      shifts: [
        {
          id: 'shift-pacing',
          venueId: VENUE_ID,
          dayOfWeek: weekday(date),
          startLocalTime: '17:00',
          endLocalTime: '23:00',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
      defaultDurationMin: 120,
      pacingPerQuarterHour: 2,
      turnTimeMin: 10,
    });
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.table.findMany.mockImplementation(() =>
      Promise.resolve(sampleTables(3)),
    );
    prisma.reservation.findMany.mockImplementation(() =>
      Promise.resolve([
        {
          id: 'res-pace',
          tableId: 'T1',
          status: ReservationStatus.CONFIRMED,
          slotLocalDate: date,
          slotLocalTime: '19:00',
          slotStartUtc: toUtcInstant(venue.timezone, {
            date,
            time: '19:00',
          }),
          durationMinutes: 90,
          partySize: 2,
          code: 'PACE',
          tables: [],
        },
      ]),
    );
    prisma.hold.findMany.mockImplementation(() =>
      Promise.resolve([
        {
          id: 'hold-pace',
          tableId: null,
          status: HoldStatus.HELD,
          slotLocalDate: date,
          slotLocalTime: '19:05',
          slotStartUtc: toUtcInstant(venue.timezone, {
            date,
            time: '19:05',
          }),
          expiresAt: new Date('2025-10-18T19:30:00Z'),
          partySize: 2,
        },
      ]),
    );

    const capped = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '19:00',
      partySize: 2,
    });
    expect(capped.tables).toHaveLength(0);
    expect(capped.stats.available).toBe(0);

    const later = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '19:30',
      partySize: 2,
    });
    expect(later.tables).not.toHaveLength(0);
  });

  it('limits returned tables to pacing remainder', async () => {
    const date = '2025-10-19';
    const venue = makeVenue({
      shifts: [
        {
          id: 'shift-limit',
          venueId: VENUE_ID,
          dayOfWeek: weekday(date),
          startLocalTime: '18:00',
          endLocalTime: '23:00',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
      defaultDurationMin: 120,
      pacingPerQuarterHour: 3,
      turnTimeMin: 5,
    });
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.table.findMany.mockImplementation(() =>
      Promise.resolve(sampleTables(4)),
    );
    prisma.reservation.findMany.mockImplementation(() =>
      Promise.resolve([
        {
          id: 'res-limit',
          tableId: 'T1',
          status: ReservationStatus.CONFIRMED,
          slotLocalDate: date,
          slotLocalTime: '20:00',
          slotStartUtc: toUtcInstant(venue.timezone, {
            date,
            time: '20:00',
          }),
          durationMinutes: 90,
          partySize: 2,
          code: 'RLIM',
          tables: [],
        },
      ]),
    );
    prisma.hold.findMany.mockResolvedValue([]);

    const result = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '20:00',
      partySize: 2,
    });
    expect(result.tables).toHaveLength(2);
    expect(result.stats.available).toBe(2);
    expect(result.stats.blocked).toBe(2);
  });

  it('returns empty availability during blackout range', async () => {
    const date = '2025-12-25';
    const venue = makeVenue({
      shifts: [
        {
          id: 'shift-blackout',
          venueId: VENUE_ID,
          dayOfWeek: weekday(date),
          startLocalTime: '10:00',
          endLocalTime: '22:00',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
      blackouts: [
        {
          id: 'blackout-1',
          venueId: VENUE_ID,
          startDate: '2025-12-24',
          endDate: '2025-12-26',
          reason: 'Holiday',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
    });
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.table.findMany.mockImplementation(() =>
      Promise.resolve(sampleTables(2)),
    );
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.hold.findMany.mockResolvedValue([]);

    const result = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '18:00',
      partySize: 2,
    });
    expect(result.tables).toHaveLength(0);
  });

  it('handles DST transition days without offset errors', async () => {
    const date = '2025-03-30'; // DST start in Europe/Tirane
    const venue = makeVenue({
      timezone: 'Europe/Tirane',
      shifts: [
        {
          id: 'shift-dst',
          venueId: VENUE_ID,
          dayOfWeek: weekday(date),
          startLocalTime: '18:00',
          endLocalTime: '23:00',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
      defaultDurationMin: 120,
      pacingPerQuarterHour: 4,
      turnTimeMin: 0,
    });
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.table.findMany.mockImplementation(() =>
      Promise.resolve(sampleTables(1)),
    );
    const holdStart = toUtcInstant(venue.timezone, {
      date,
      time: '19:30',
    });
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.hold.findMany.mockResolvedValue([
      {
        id: 'hold-dst',
        tableId: 'T1',
        status: HoldStatus.HELD,
        slotLocalDate: date,
        slotLocalTime: '19:30',
        slotStartUtc: holdStart,
        expiresAt: new Date(holdStart.getTime() + 5 * 60_000),
        partySize: 2,
      },
    ]);

    const result = await service.getAvailability({
      venueId: VENUE_ID,
      date,
      time: '19:30',
      partySize: 2,
    });
    expect(result.tables).toHaveLength(0);
    expect(result.conflicts.holds).toHaveLength(1);
    expect(result.conflicts.holds[0].slotLocalTime).toBe('19:30');
  });
});

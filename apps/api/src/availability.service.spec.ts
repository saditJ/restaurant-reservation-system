import { AvailabilityService } from './availability.service';
import type { PrismaService } from './prisma.service';
import { HoldStatus, ReservationStatus } from '@prisma/client';
import { toUtcInstant } from './utils/time';

type MockedPrisma = {
  venue: { findUnique: jest.Mock };
  table: { findMany: jest.Mock };
  reservation: { findMany: jest.Mock };
  hold: { findMany: jest.Mock };
  shift: { findMany: jest.Mock };
  availabilityRule: { findMany: jest.Mock };
  blackout: { findMany: jest.Mock };
};

const VENUE_ID = 'venue-test';

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function makeVenue(overrides: Record<string, unknown> = {}) {
  const base = {
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
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    availabilityRules: [
      {
        id: 'rule-1',
        venueId: VENUE_ID,
        minPartySize: 1,
        maxPartySize: 6,
        slotLengthMinutes: 90,
        bufferMinutes: 15,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ],
    shifts: [
      {
        id: 'shift-1',
        venueId: VENUE_ID,
        dayOfWeek: 4,
        startLocalTime: '18:00',
        endLocalTime: '22:00',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ],
    blackouts: [] as Array<{
      id: string;
      venueId: string;
      startDate: string;
      endDate: string;
      reason?: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  };
  return { ...base, ...overrides };
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

  beforeEach(() => {
    prisma = {
      venue: { findUnique: jest.fn() },
      table: { findMany: jest.fn() },
      reservation: { findMany: jest.fn() },
      hold: { findMany: jest.fn() },
      shift: { findMany: jest.fn() },
      availabilityRule: { findMany: jest.fn() },
      blackout: { findMany: jest.fn() },
    };
    service = new AvailabilityService(prisma as unknown as PrismaService);
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

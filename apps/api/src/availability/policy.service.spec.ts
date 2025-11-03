import { Temporal } from '@js-temporal/polyfill';
import { AvailabilityPolicyService, generatePolicySlots } from './policy.service';

const TIMEZONE = 'Europe/Tirane';

function timeAsDate(time: string) {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

describe('AvailabilityPolicyService helpers', () => {
  it('skips missing hour during DST forward transition', () => {
    const slots = generatePolicySlots({
      date: '2025-03-30',
      timezone: TIMEZONE,
      windowMinutes: 60,
      buffer: { beforeMinutes: 0, afterMinutes: 0 },
      shifts: [
        {
          id: 'shift-forward',
          dow: 0,
          startsAtLocal: timeAsDate('00:00'),
          endsAtLocal: timeAsDate('06:00'),
          capacitySeats: 20,
          capacityCovers: 80,
          isActive: true,
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        },
      ],
    });

    const startTimes = slots.map((slot) =>
      slot.start.toPlainTime().with({ second: 0, millisecond: 0 }).toString(),
    );

    expect(startTimes).toEqual([
      '00:00:00',
      '01:00:00',
      '03:00:00',
      '04:00:00',
      '05:00:00',
    ]);
    expect(startTimes).not.toContain('02:00:00');
  });

  it('captures duplicated hour during DST backward transition', () => {
    const slots = generatePolicySlots({
      date: '2025-10-26',
      timezone: TIMEZONE,
      windowMinutes: 60,
      buffer: { beforeMinutes: 0, afterMinutes: 0 },
      shifts: [
        {
          id: 'shift-back',
          dow: 0,
          startsAtLocal: timeAsDate('00:00'),
          endsAtLocal: timeAsDate('05:00'),
          capacitySeats: 20,
          capacityCovers: 80,
          isActive: true,
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        },
      ],
    });

    expect(slots).toHaveLength(6);

    const secondHourSlots = slots.filter(
      (slot) => slot.start.toPlainTime().hour === 2,
    );
    expect(secondHourSlots).toHaveLength(2);

    const [firstOccurrence, secondOccurrence] = secondHourSlots;
    expect(
      firstOccurrence.start.toInstant().epochMilliseconds,
    ).toBeLessThan(
      secondOccurrence.start.toInstant().epochMilliseconds,
    );
  });
});

describe('AvailabilityPolicyService', () => {
  const metrics = {
    incrementAvailabilityPolicyEval: jest.fn(),
  } as { incrementAvailabilityPolicyEval: (venueId: string) => void };

  const prisma = {
    venue: {
      findUnique: jest.fn(),
    },
  } as { venue: { findUnique: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks blackout dates with zero availability', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      timezone: TIMEZONE,
      shifts: [
        {
          id: 'shift-1',
          dow: 0,
          startsAtLocal: timeAsDate('12:00'),
          endsAtLocal: timeAsDate('22:00'),
          capacitySeats: 40,
          capacityCovers: 160,
          isActive: true,
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        },
      ],
      pacingRules: [
        {
          id: 'pace-1',
          windowMinutes: 15,
          maxReservations: 4,
          maxCovers: null,
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        },
      ],
      blackoutDates: [
        {
          id: 'blackout-1',
          date: new Date('2025-12-31T00:00:00.000Z'),
          reason: 'NYE',
          updatedAt: new Date('2025-12-01T00:00:00Z'),
        },
      ],
      serviceBuffer: {
        id: 'buffer-1',
        venueId: 'venue-1',
        beforeMinutes: 10,
        afterMinutes: 15,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      },
    });

    const service = new AvailabilityPolicyService(prisma as any, metrics as any);
    const result = await service.evaluateDay({
      venueId: 'venue-1',
      date: '2025-12-31',
    });

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].reason).toBe('blackout');
    expect(result.slots[0].capacity).toBe(0);
    expect(result.slots[0].remaining).toBe(0);
    expect(typeof result.policyHash).toBe('string');
    expect(result.policyHash).toHaveLength(16);
    expect(metrics.incrementAvailabilityPolicyEval).toHaveBeenCalledWith(
      'venue-1',
    );
  });
});

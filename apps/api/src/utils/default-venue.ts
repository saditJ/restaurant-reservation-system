import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma.service';

export const DEFAULT_VENUE_ID = 'venue-main';
const DEFAULT_VENUE_NAME = 'Mock Bistro';
const DEFAULT_TIMEZONE = 'Europe/Tirane';

const DEFAULT_HOURS = {
  monday: [{ start: '10:00', end: '23:00' }],
  tuesday: [{ start: '10:00', end: '23:00' }],
  wednesday: [{ start: '10:00', end: '23:00' }],
  thursday: [{ start: '10:00', end: '23:00' }],
  friday: [{ start: '10:00', end: '23:30' }],
  saturday: [{ start: '10:00', end: '23:30' }],
  sunday: [],
};

const DEFAULT_TABLES: Array<
  Prisma.TableCreateManyInput & { venueId: string }
> = [
  {
    id: 'T1',
    label: 'T1',
    capacity: 2,
    area: 'Dining',
    zone: 'Dining',
    joinGroupId: 'DIN-PAIR-A',
    x: 10,
    y: 10,
    width: 2,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'T2',
    label: 'T2',
    capacity: 2,
    area: 'Dining',
    zone: 'Dining',
    joinGroupId: 'DIN-PAIR-A',
    x: 14,
    y: 10,
    width: 2,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'T3',
    label: 'T3',
    capacity: 4,
    area: 'Dining',
    zone: 'Dining',
    joinGroupId: 'DIN-QUAD-A',
    x: 18,
    y: 10,
    width: 3,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'T4',
    label: 'T4',
    capacity: 4,
    area: 'Dining',
    zone: 'Dining',
    joinGroupId: 'DIN-QUAD-B',
    x: 10,
    y: 14,
    width: 3,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'T5',
    label: 'T5',
    capacity: 6,
    area: 'Dining',
    zone: 'Dining',
    joinGroupId: 'DIN-SIX-A',
    x: 15,
    y: 14,
    width: 3,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'T6',
    label: 'T6',
    capacity: 3,
    area: 'Dining',
    zone: 'Dining',
    joinGroupId: 'DIN-TRIO-A',
    x: 20,
    y: 8,
    width: 3,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'T7',
    label: 'T7',
    capacity: 3,
    area: 'Dining',
    zone: 'Dining',
    joinGroupId: 'DIN-TRIO-A',
    x: 24,
    y: 12,
    width: 3,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'B1',
    label: 'B1',
    capacity: 4,
    area: 'Terrace',
    zone: 'Terrace',
    joinGroupId: 'TER-QUAD-A',
    x: 5,
    y: 18,
    width: 3,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'B2',
    label: 'B2',
    capacity: 4,
    area: 'Terrace',
    zone: 'Terrace',
    joinGroupId: 'TER-QUAD-A',
    x: 10,
    y: 18,
    width: 3,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    id: 'B3',
    label: 'B3',
    capacity: 2,
    area: 'Terrace',
    zone: 'Terrace',
    joinGroupId: 'TER-PAIR-A',
    x: 15,
    y: 18,
    width: 2,
    height: 2,
    venueId: DEFAULT_VENUE_ID,
  },
];

const DEFAULT_SHIFTS: Array<Prisma.ShiftCreateManyInput> = [
  { dayOfWeek: 0, startLocalTime: '10:00', endLocalTime: '15:00', venueId: DEFAULT_VENUE_ID },
  { dayOfWeek: 0, startLocalTime: '18:00', endLocalTime: '22:00', venueId: DEFAULT_VENUE_ID },
  { dayOfWeek: 1, startLocalTime: '10:00', endLocalTime: '22:30', venueId: DEFAULT_VENUE_ID },
  { dayOfWeek: 2, startLocalTime: '10:00', endLocalTime: '22:30', venueId: DEFAULT_VENUE_ID },
  { dayOfWeek: 3, startLocalTime: '10:00', endLocalTime: '23:00', venueId: DEFAULT_VENUE_ID },
  { dayOfWeek: 4, startLocalTime: '10:00', endLocalTime: '23:30', venueId: DEFAULT_VENUE_ID },
  { dayOfWeek: 5, startLocalTime: '10:00', endLocalTime: '23:30', venueId: DEFAULT_VENUE_ID },
];

const DEFAULT_RULES: Array<Prisma.AvailabilityRuleCreateManyInput> = [
  { venueId: DEFAULT_VENUE_ID, minPartySize: 1, maxPartySize: 2, slotLengthMinutes: 90, bufferMinutes: 10 },
  { venueId: DEFAULT_VENUE_ID, minPartySize: 3, maxPartySize: 4, slotLengthMinutes: 105, bufferMinutes: 10 },
  { venueId: DEFAULT_VENUE_ID, minPartySize: 5, maxPartySize: 8, slotLengthMinutes: 120, bufferMinutes: 15 },
];

const DEFAULT_BLACKOUTS: Array<Prisma.BlackoutCreateManyInput> = [
  {
    venueId: DEFAULT_VENUE_ID,
    startDate: '2025-12-24',
    endDate: '2025-12-26',
    reason: 'Holiday closure',
  },
];

/**
 * Ensure the default demo venue exists so the UI keeps working even if the
 * local database has not been seeded. Also bootstraps a minimal set of tables
 * to keep availability and floor plans functional.
 */
export async function ensureDefaultVenue(prisma: PrismaService) {
  const venue = await prisma.venue.upsert({
    where: { id: DEFAULT_VENUE_ID },
    update: {},
    create: {
      id: DEFAULT_VENUE_ID,
      name: DEFAULT_VENUE_NAME,
      timezone: DEFAULT_TIMEZONE,
      hours: DEFAULT_HOURS,
      holdTtlMin: 15,
      turnTimeMin: 10,
      defaultDurationMin: 120,
      cancellationWindowMin: 120,
      guestCanModifyUntilMin: 120,
      noShowFeePolicy: false,
      pacingPerQuarterHour: 4,
    },
  });

  const existingTables = await prisma.table.count({
    where: { venueId: DEFAULT_VENUE_ID },
  });

  if (existingTables === 0) {
    await prisma.table.createMany({
      data: DEFAULT_TABLES,
      skipDuplicates: true,
    });
  }

  const existingShifts = await prisma.shift.count({
    where: { venueId: DEFAULT_VENUE_ID },
  });
  if (existingShifts === 0) {
    await prisma.shift.createMany({
      data: DEFAULT_SHIFTS,
      skipDuplicates: true,
    });
  }

  const existingRules = await prisma.availabilityRule.count({
    where: { venueId: DEFAULT_VENUE_ID },
  });
  if (existingRules === 0) {
    await prisma.availabilityRule.createMany({
      data: DEFAULT_RULES,
      skipDuplicates: true,
    });
  }

  const existingBlackouts = await prisma.blackout.count({
    where: { venueId: DEFAULT_VENUE_ID },
  });
  if (existingBlackouts === 0) {
    await prisma.blackout.createMany({
      data: DEFAULT_BLACKOUTS,
      skipDuplicates: true,
    });
  }

  return venue;
}

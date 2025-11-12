import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma.service';

export const DEFAULT_TENANT_ID = 'tenant-demo';
export const DEFAULT_TENANT_SLUG = 'demo';
export const DEFAULT_TENANT_NAME = 'Demo Tenant';
export const DEFAULT_TENANT_PLAN_ID = 'tenant-plan-demo';

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

const toUtcTime = (time: string) => {
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
};

const DEFAULT_TABLES: Array<Prisma.TableCreateManyInput & { venueId: string }> =
  [
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

function withTableGeometryDefaults(
  table: Prisma.TableCreateManyInput & { venueId: string },
) {
  const baseWidth =
    typeof table.width === 'number' &&
    Number.isFinite(table.width) &&
    table.width > 0
      ? table.width
      : 1;
  const baseHeight =
    typeof table.height === 'number' &&
    Number.isFinite(table.height) &&
    table.height > 0
      ? table.height
      : 1;
  const maxSeats =
    typeof table.capacity === 'number' &&
    Number.isFinite(table.capacity) &&
    table.capacity > 0
      ? table.capacity
      : 2;
  return {
    ...table,
    angle: table.angle ?? 0,
    shape: table.shape ?? 'rect',
    w: table.w ?? baseWidth * 60,
    h: table.h ?? baseHeight * 60,
    minSeating:
      table.minSeating ??
      Math.max(
        1,
        Math.min(
          maxSeats,
          typeof table.capacity === 'number' ? table.capacity : 2,
        ),
      ),
  };
}

const DEFAULT_SHIFTS: Array<Prisma.ShiftCreateManyInput> = [
  {
    dow: 0,
    startsAtLocal: toUtcTime('10:00'),
    endsAtLocal: toUtcTime('15:00'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    dow: 0,
    startsAtLocal: toUtcTime('18:00'),
    endsAtLocal: toUtcTime('22:00'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    dow: 1,
    startsAtLocal: toUtcTime('10:00'),
    endsAtLocal: toUtcTime('22:30'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    dow: 2,
    startsAtLocal: toUtcTime('10:00'),
    endsAtLocal: toUtcTime('22:30'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    dow: 3,
    startsAtLocal: toUtcTime('10:00'),
    endsAtLocal: toUtcTime('23:00'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    dow: 4,
    startsAtLocal: toUtcTime('10:00'),
    endsAtLocal: toUtcTime('23:30'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    dow: 5,
    startsAtLocal: toUtcTime('10:00'),
    endsAtLocal: toUtcTime('23:30'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
  {
    dow: 6,
    startsAtLocal: toUtcTime('10:00'),
    endsAtLocal: toUtcTime('23:30'),
    capacitySeats: 40,
    capacityCovers: 160,
    isActive: true,
    venueId: DEFAULT_VENUE_ID,
  },
];

const DEFAULT_RULES: Array<Prisma.AvailabilityRuleCreateManyInput> = [
  {
    venueId: DEFAULT_VENUE_ID,
    minPartySize: 1,
    maxPartySize: 2,
    slotLengthMinutes: 90,
    bufferMinutes: 10,
  },
  {
    venueId: DEFAULT_VENUE_ID,
    minPartySize: 3,
    maxPartySize: 4,
    slotLengthMinutes: 105,
    bufferMinutes: 10,
  },
  {
    venueId: DEFAULT_VENUE_ID,
    minPartySize: 5,
    maxPartySize: 8,
    slotLengthMinutes: 120,
    bufferMinutes: 15,
  },
];

const DEFAULT_BLACKOUTS: Array<Prisma.BlackoutDateCreateManyInput> = [
  {
    venueId: DEFAULT_VENUE_ID,
    date: new Date('2025-12-24T00:00:00.000Z'),
    reason: 'Holiday closure',
  },
  {
    venueId: DEFAULT_VENUE_ID,
    date: new Date('2025-12-25T00:00:00.000Z'),
    reason: 'Holiday closure',
  },
  {
    venueId: DEFAULT_VENUE_ID,
    date: new Date('2025-12-26T00:00:00.000Z'),
    reason: 'Holiday closure',
  },
];

const DEFAULT_SERVICE_BUFFER: Prisma.ServiceBufferUncheckedCreateInput = {
  venueId: DEFAULT_VENUE_ID,
  beforeMinutes: 10,
  afterMinutes: 15,
};

/**
 * Ensure the default seed tenant exists so any venue bootstrapping can attach
 * to it. Also guarantees a baseline plan for metering to reference.
 */
export async function ensureDefaultTenant(prisma: PrismaService) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {
      name: DEFAULT_TENANT_NAME,
      city: 'Tirana',
      timezone: DEFAULT_TIMEZONE,
      isActive: true,
    },
    create: {
      id: DEFAULT_TENANT_ID,
      name: DEFAULT_TENANT_NAME,
      slug: DEFAULT_TENANT_SLUG,
      city: 'Tirana',
      timezone: DEFAULT_TIMEZONE,
      isActive: true,
    },
  });

  await prisma.tenantPlan.upsert({
    where: { id: DEFAULT_TENANT_PLAN_ID },
    update: {
      planName: 'Starter',
      seatsMax: 2,
      storageMbMax: 100,
      venuesMax: 3,
      servicesMax: 50,
      localeCountMax: 1,
      isRateLimited: true,
    },
    create: {
      id: DEFAULT_TENANT_PLAN_ID,
      tenantId: tenant.id,
      planName: 'Starter',
      seatsMax: 2,
      storageMbMax: 100,
      venuesMax: 3,
      servicesMax: 50,
      localeCountMax: 1,
      isRateLimited: true,
    },
  });

  return tenant;
}

/**
 * Ensure the default demo venue exists so the UI keeps working even if the
 * local database has not been seeded. Also bootstraps a minimal set of tables
 * to keep availability and floor plans functional.
 */
export async function ensureDefaultVenue(
  prisma: PrismaService,
  tenantId: string = DEFAULT_TENANT_ID,
) {
  let tenantIdToUse = tenantId;
  if (tenantId === DEFAULT_TENANT_ID) {
    const tenant = await ensureDefaultTenant(prisma);
    tenantIdToUse = tenant.id;
  } else {
    const existingTenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!existingTenant) {
      const tenant = await ensureDefaultTenant(prisma);
      tenantIdToUse = tenant.id;
    }
  }

  const venue = await prisma.venue.upsert({
    where: { id: DEFAULT_VENUE_ID },
    update: {
      tenantId: tenantIdToUse,
    },
    create: {
      id: DEFAULT_VENUE_ID,
      tenantId: tenantIdToUse,
      name: DEFAULT_VENUE_NAME,
      timezone: DEFAULT_TIMEZONE,
      hours: DEFAULT_HOURS,
      floorplanRoomWidth: 1200,
      floorplanRoomHeight: 800,
      floorplanGridSize: 20,
      holdTtlMin: 15,
      turnTimeMin: 10,
      defaultDurationMin: 120,
      cancellationWindowMin: 120,
      guestCanModifyUntilMin: 120,
      noShowFeePolicy: false,
      pacingPerQuarterHour: 4,
      reminderHoursBefore: null,
    },
  });

  const existingTables = await prisma.table.count({
    where: { venueId: DEFAULT_VENUE_ID },
  });

  if (existingTables === 0) {
    await prisma.table.createMany({
      data: DEFAULT_TABLES.map(withTableGeometryDefaults),
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

  const existingBlackouts = await prisma.blackoutDate.count({
    where: { venueId: DEFAULT_VENUE_ID },
  });
  if (existingBlackouts === 0) {
    await prisma.blackoutDate.createMany({
      data: DEFAULT_BLACKOUTS,
      skipDuplicates: true,
    });
  }

  const buffer = await prisma.serviceBuffer.findUnique({
    where: { venueId: DEFAULT_VENUE_ID },
  });
  if (!buffer) {
    await prisma.serviceBuffer.create({ data: DEFAULT_SERVICE_BUFFER });
  }

  return venue;
}

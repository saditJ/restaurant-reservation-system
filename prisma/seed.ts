import { CommTemplateKind, HoldStatus, ReservationStatus } from '@prisma/client';
import { createHash } from 'crypto';
import prismaPiiModule from '../apps/api/src/privacy/prisma-pii';

type PrismaPiiModule = typeof import('../apps/api/src/privacy/prisma-pii');
const { createPrismaWithPii } = prismaPiiModule as PrismaPiiModule;

const prisma = createPrismaWithPii();

type SeedReservation = {
  id: string;
  code: string;
  tableId: string | null;
  status: ReservationStatus;
  guestName: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  partySize: number;
  date: string;
  time: string;
  durationMinutes?: number;
  channel?: string;
  createdBy?: string;
};

type SeedHold = {
  id: string;
  tableId: string | null;
  status: HoldStatus;
  partySize: number;
  date: string;
  time: string;
  expiresInMinutes?: number;
  expireOffsetMinutes?: number;
  createdBy?: string;
  reservationId?: string | null;
};

type SeedVenue = {
  id: string;
  name: string;
  timezone: string;
  hours: Record<string, Array<{ start: string; end: string }>>;
  turnTimeMin: number;
  holdTtlMin: number;
  defaultDurationMin: number;
  cancellationWindowMin: number;
  guestCanModifyUntilMin: number;
  noShowFeePolicy: boolean;
  pacingPerQuarterHour: number;
  reminderHoursBefore?: number | null;
  tables: Array<{
    id: string;
    label: string;
    capacity: number;
    area?: string | null;
    zone?: string | null;
    joinGroupId?: string | null;
  }>;
  shifts: Array<{
    dow: number;
    startsAt: string;
    endsAt: string;
    capacitySeats?: number;
    capacityCovers?: number;
    isActive?: boolean;
  }>;
  pacingRules: Array<{
    windowMinutes: number;
    maxReservations?: number | null;
    maxCovers?: number | null;
  }>;
  blackoutDates: Array<{ date: string; reason?: string | null }>;
  serviceBuffer: { beforeMinutes: number; afterMinutes: number };
  availabilityRules: Array<{
    minPartySize: number;
    maxPartySize: number;
    slotLengthMinutes: number;
    bufferMinutes: number;
  }>;
  reservations?: SeedReservation[];
  holds?: SeedHold[];
};

const COMM_TEMPLATE_SEEDS: Array<{
  kind: CommTemplateKind;
  subject: string;
  html: string;
}> = [
  {
    kind: CommTemplateKind.CONFIRM,
    subject: 'Reservation confirmed for {{guestName}}',
    html: [
      '<html>',
      '  <body>',
      '    <p>Hi {{guestName}},</p>',
      '    <p>Your reservation for {{partySize}} guests at {{venueName}} on {{time}} is confirmed.</p>',
      '    <p>Manage your reservation: <a href="{{manageUrl}}">{{manageUrl}}</a></p>',
      '    <p>Exclusive offer: <a href="{{offerUrl}}">{{offerUrl}}</a></p>',
      '  </body>',
      '</html>',
    ].join('\n'),
  },
  {
    kind: CommTemplateKind.REMINDER,
    subject: 'Reminder: upcoming visit to {{venueName}}',
    html: [
      '<html>',
      '  <body>',
      '    <p>Hello {{guestName}},</p>',
      '    <p>This is a reminder of your {{partySize}} person reservation at {{venueName}} on {{time}}.</p>',
      '    <p>Review or update details here: <a href="{{manageUrl}}">{{manageUrl}}</a></p>',
      '    <p>Preview tonight\'s offer: <a href="{{offerUrl}}">{{offerUrl}}</a></p>',
      '  </body>',
      '</html>',
    ].join('\n'),
  },
  {
    kind: CommTemplateKind.CANCELLED,
    subject: 'Reservation cancelled for {{guestName}}',
    html: [
      '<html>',
      '  <body>',
      '    <p>Hi {{guestName}},</p>',
      '    <p>Your reservation for {{partySize}} at {{venueName}} on {{time}} has been cancelled.</p>',
      '    <p>You can manage your bookings anytime: <a href="{{manageUrl}}">{{manageUrl}}</a></p>',
      '    <p>See alternative offers: <a href="{{offerUrl}}">{{offerUrl}}</a></p>',
      '  </body>',
      '</html>',
    ].join('\n'),
  },
  {
    kind: CommTemplateKind.OFFER,
    subject: 'A new offer from {{venueName}}',
    html: [
      '<html>',
      '  <body>',
      '    <p>Hello {{guestName}},</p>',
      '    <p>We would love to host your party of {{partySize}} at {{venueName}} on {{time}}.</p>',
      '    <p>Claim this offer now: <a href="{{offerUrl}}">{{offerUrl}}</a></p>',
      '    <p>Need adjustments? Manage details here: <a href="{{manageUrl}}">{{manageUrl}}</a></p>',
      '  </body>',
      '</html>',
    ].join('\n'),
  },
];

const VENUES: SeedVenue[] = [
  {
    id: 'venue-brooklyn',
    name: 'Riverfront Brooklyn',
    timezone: 'America/New_York',
    hours: {
      monday: [{ start: '16:00', end: '23:00' }],
      tuesday: [{ start: '16:00', end: '23:00' }],
      wednesday: [{ start: '16:00', end: '23:00' }],
      thursday: [{ start: '16:00', end: '23:59' }],
      friday: [{ start: '15:00', end: '23:59' }],
      saturday: [{ start: '11:00', end: '23:59' }],
      sunday: [{ start: '10:00', end: '22:00' }],
    },
    turnTimeMin: 15,
    holdTtlMin: 12,
    defaultDurationMin: 120,
    cancellationWindowMin: 180,
    guestCanModifyUntilMin: 120,
    noShowFeePolicy: false,
    pacingPerQuarterHour: 4,
    reminderHoursBefore: 24,
    tables: [
      { id: 'BK-101', label: '101', capacity: 2, area: 'Dining', joinGroupId: 'BK-DUO' },
      { id: 'BK-102', label: '102', capacity: 4, area: 'Dining', joinGroupId: 'BK-DUO' },
      { id: 'BK-201', label: '201', capacity: 6, area: 'Patio', zone: 'Patio' },
    ],
    shifts: [
      { dow: 0, startsAt: '12:00', endsAt: '22:00' },
      { dow: 1, startsAt: '12:00', endsAt: '22:00' },
      { dow: 2, startsAt: '12:00', endsAt: '22:00' },
      { dow: 3, startsAt: '12:00', endsAt: '22:00' },
      { dow: 4, startsAt: '12:00', endsAt: '22:00' },
      { dow: 5, startsAt: '18:00', endsAt: '23:00' },
      { dow: 6, startsAt: '18:00', endsAt: '23:00' },
    ],
    pacingRules: [{ windowMinutes: 15, maxReservations: 4, maxCovers: null }],
    blackoutDates: [{ date: '2025-12-31', reason: 'NYE private event' }],
    serviceBuffer: { beforeMinutes: 10, afterMinutes: 15 },
    availabilityRules: [
      { minPartySize: 1, maxPartySize: 2, slotLengthMinutes: 90, bufferMinutes: 15 },
      { minPartySize: 3, maxPartySize: 6, slotLengthMinutes: 120, bufferMinutes: 20 },
    ],
    reservations: [
      {
        id: 'BK-RES-LOCKED',
        code: 'BK001',
        tableId: 'BK-101',
        status: ReservationStatus.CONFIRMED,
        guestName: 'Amelia Banks',
        guestPhone: '+1 929 555 0123',
        partySize: 2,
        date: '2025-12-24',
        time: '19:00',
        channel: 'staff-console',
        createdBy: 'seed',
      },
      {
        id: 'BK-RES-LARGE',
        code: 'BK002',
        tableId: 'BK-201',
        status: ReservationStatus.SEATED,
        guestName: 'Kai Romero',
        guestEmail: 'kai.romero@example.com',
        partySize: 5,
        date: '2025-12-24',
        time: '19:30',
        durationMinutes: 150,
        channel: 'staff-console',
        createdBy: 'seed',
      },
    ],
    holds: [
      {
        id: 'BK-HOLD-ACTIVE',
        tableId: 'BK-102',
        status: HoldStatus.HELD,
        partySize: 4,
        date: '2025-12-24',
        time: '18:00',
        expiresInMinutes: 30,
        createdBy: 'seed',
      },
      {
        id: 'BK-HOLD-LAPSED',
        tableId: 'BK-201',
        status: HoldStatus.HELD,
        partySize: 5,
        date: '2025-12-24',
        time: '16:45',
        expireOffsetMinutes: -30,
        createdBy: 'seed',
      },
      {
        id: 'BK-HOLD-CONSUMED',
        tableId: 'BK-101',
        status: HoldStatus.CONSUMED,
        partySize: 2,
        date: '2025-12-24',
        time: '19:00',
        reservationId: 'BK-RES-LOCKED',
        expireOffsetMinutes: -5,
        createdBy: 'seed',
      },
      {
        id: 'BK-HOLD-TABLELESS',
        tableId: null,
        status: HoldStatus.HELD,
        partySize: 2,
        date: '2025-12-24',
        time: '21:00',
        expiresInMinutes: 45,
        createdBy: 'seed',
      },
    ],
  },
  {
    id: 'venue-london',
    name: 'Covent Garden Rooftop',
    timezone: 'Europe/London',
    hours: {
      monday: [{ start: '12:00', end: '23:00' }],
      tuesday: [{ start: '12:00', end: '23:00' }],
      wednesday: [{ start: '12:00', end: '23:00' }],
      thursday: [{ start: '12:00', end: '23:30' }],
      friday: [{ start: '12:00', end: '00:30' }],
      saturday: [{ start: '10:00', end: '00:30' }],
      sunday: [{ start: '10:00', end: '22:00' }],
    },
    turnTimeMin: 20,
    holdTtlMin: 10,
    defaultDurationMin: 105,
    cancellationWindowMin: 240,
    guestCanModifyUntilMin: 150,
    noShowFeePolicy: true,
    pacingPerQuarterHour: 6,
    tables: [
      { id: 'LD-01', label: '01', capacity: 2, area: 'Terrace', joinGroupId: 'LD-DUO' },
      { id: 'LD-02', label: '02', capacity: 4, area: 'Terrace', joinGroupId: 'LD-DUO' },
      { id: 'LD-10', label: '10', capacity: 6, area: 'Lounge', zone: 'Fireplace' },
    ],
    shifts: [
      { dow: 0, startsAt: '12:00', endsAt: '22:00' },
      { dow: 1, startsAt: '12:00', endsAt: '22:00' },
      { dow: 2, startsAt: '12:00', endsAt: '22:00' },
      { dow: 3, startsAt: '12:00', endsAt: '22:00' },
      { dow: 4, startsAt: '12:00', endsAt: '22:00' },
      { dow: 5, startsAt: '18:00', endsAt: '23:00' },
      { dow: 6, startsAt: '18:00', endsAt: '23:00' },
    ],
    pacingRules: [{ windowMinutes: 15, maxReservations: 4, maxCovers: null }],
    blackoutDates: [{ date: '2025-12-31', reason: 'NYE private event' }],
    serviceBuffer: { beforeMinutes: 10, afterMinutes: 15 },
    availabilityRules: [
      { minPartySize: 1, maxPartySize: 2, slotLengthMinutes: 90, bufferMinutes: 10 },
      { minPartySize: 3, maxPartySize: 6, slotLengthMinutes: 120, bufferMinutes: 15 },
    ],
    reservations: [
      {
        id: 'LD-RES-SUNSET',
        code: 'LD201',
        tableId: 'LD-02',
        status: ReservationStatus.CONFIRMED,
        guestName: 'Sasha Wren',
        partySize: 4,
        date: '2025-12-30',
        time: '19:15',
        channel: 'widget',
        createdBy: 'seed',
      },
      {
        id: 'LD-RES-CORPORATE',
        code: 'LD202',
        tableId: 'LD-10',
        status: ReservationStatus.PENDING,
        guestName: 'Corporate Hold',
        partySize: 6,
        date: '2025-12-30',
        time: '20:00',
        durationMinutes: 150,
        channel: 'b2b',
        createdBy: 'seed',
      },
    ],
    holds: [
      {
        id: 'LD-HOLD-PATIO',
        tableId: 'LD-01',
        status: HoldStatus.HELD,
        partySize: 2,
        date: '2025-12-30',
        time: '18:30',
        expiresInMinutes: 25,
        createdBy: 'seed',
      },
      {
        id: 'LD-HOLD-TABLELESS',
        tableId: null,
        status: HoldStatus.HELD,
        partySize: 2,
        date: '2025-12-30',
        time: '19:00',
        expiresInMinutes: 20,
        createdBy: 'seed',
      },
      {
        id: 'LD-HOLD-OLD',
        tableId: 'LD-02',
        status: HoldStatus.EXPIRED,
        partySize: 4,
        date: '2025-12-28',
        time: '17:30',
        expireOffsetMinutes: -120,
        createdBy: 'seed',
      },
    ],
  },
];

function toUtc(timezone: string, date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utcCandidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const localized = new Date(
    utcCandidate.toLocaleString('en-US', { timeZone: timezone }),
  );
  const offsetMs = utcCandidate.getTime() - localized.getTime();
  return new Date(localized.getTime() + offsetMs);
}

function buildSlot(timezone: string, date: string, time: string) {
  return {
    slotLocalDate: date,
    slotLocalTime: time,
    slotStartUtc: toUtc(timezone, date, time),
  };
}

function toPolicyTime(time: string): Date {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

function toDateOnly(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function resolveExpiry(hold: SeedHold): Date {
  if (hold.expireOffsetMinutes !== undefined) {
    return new Date(Date.now() + hold.expireOffsetMinutes * 60_000);
  }
  const windowMinutes = hold.expiresInMinutes ?? 15;
  return new Date(Date.now() + windowMinutes * 60_000);
}

async function main() {
  await prisma.$transaction([
    prisma.notificationOutbox.deleteMany({}),
    prisma.commTemplate.deleteMany({}),
    prisma.hold.deleteMany({}),
    prisma.reservation.deleteMany({}),
    prisma.table.deleteMany({}),
    prisma.shift.deleteMany({}),
    prisma.availabilityRule.deleteMany({}),
    prisma.pacingRule.deleteMany({}),
    prisma.blackoutDate.deleteMany({}),
    prisma.serviceBuffer.deleteMany({}),
    prisma.venue.deleteMany({}),
  ]);

  for (const venue of VENUES) {
    const totalSeats = venue.tables.reduce((sum, table) => sum + table.capacity, 0);
    const defaultCoverCapacity = Math.max(totalSeats, Math.ceil(totalSeats * 1.5));
    const shiftCreateData = venue.shifts.map((shift) => ({
      dow: shift.dow,
      startsAtLocal: toPolicyTime(shift.startsAt),
      endsAtLocal: toPolicyTime(shift.endsAt),
      capacitySeats: shift.capacitySeats ?? totalSeats,
      capacityCovers: shift.capacityCovers ?? defaultCoverCapacity,
      isActive: shift.isActive ?? true,
    }));
    const pacingRuleCreateData = venue.pacingRules.map((rule) => ({
      windowMinutes: rule.windowMinutes,
      maxReservations: rule.maxReservations ?? null,
      maxCovers: rule.maxCovers ?? null,
    }));
    const blackoutDateCreateData = venue.blackoutDates.map((blackout) => ({
      date: toDateOnly(blackout.date),
      reason: blackout.reason ?? null,
    }));

    await prisma.venue.create({
      data: {
        id: venue.id,
        name: venue.name,
        timezone: venue.timezone,
        hours: venue.hours,
        turnTimeMin: venue.turnTimeMin,
        holdTtlMin: venue.holdTtlMin,
        defaultDurationMin: venue.defaultDurationMin,
        cancellationWindowMin: venue.cancellationWindowMin,
        guestCanModifyUntilMin: venue.guestCanModifyUntilMin,
        noShowFeePolicy: venue.noShowFeePolicy,
        pacingPerQuarterHour: venue.pacingPerQuarterHour,
        reminderHoursBefore: venue.reminderHoursBefore ?? null,
        tables: { create: venue.tables },
        shifts: { create: shiftCreateData },
        pacingRules: { create: pacingRuleCreateData },
        blackoutDates: { create: blackoutDateCreateData },
        serviceBuffer: {
          create: {
            beforeMinutes: venue.serviceBuffer.beforeMinutes,
            afterMinutes: venue.serviceBuffer.afterMinutes,
          },
        },
        availabilityRules: { create: venue.availabilityRules },
      },
    });

    await prisma.commTemplate.createMany({
      data: COMM_TEMPLATE_SEEDS.map(({ kind, subject, html }) => ({
        venueId: venue.id,
        kind,
        subject,
        html,
      })),
    });

    if (venue.reservations?.length) {
      await prisma.reservation.createMany({
        data: venue.reservations.map((reservation) => ({
          id: reservation.id,
          code: reservation.code,
          venueId: venue.id,
          tableId: reservation.tableId,
          status: reservation.status,
          guestName: reservation.guestName,
          guestPhone: reservation.guestPhone ?? null,
          guestEmail: reservation.guestEmail ?? null,
          partySize: reservation.partySize,
          durationMinutes:
            reservation.durationMinutes ?? venue.defaultDurationMin,
          channel: reservation.channel ?? 'staff-console',
          createdBy: reservation.createdBy ?? 'seed',
          ...buildSlot(venue.timezone, reservation.date, reservation.time),
        })),
      });
    }

    if (venue.holds?.length) {
      await prisma.hold.createMany({
        data: venue.holds.map((hold) => ({
          id: hold.id,
          venueId: venue.id,
          tableId: hold.tableId,
          status: hold.status,
          partySize: hold.partySize,
          reservationId: hold.reservationId ?? null,
          createdBy: hold.createdBy ?? 'seed',
          expiresAt: resolveExpiry(hold),
          ...buildSlot(venue.timezone, hold.date, hold.time),
        })),
      });
    }
  }

  for (const venue of VENUES) {
    const [tables, reservations, holds] = await Promise.all([
      prisma.table.count({ where: { venueId: venue.id } }),
      prisma.reservation.count({ where: { venueId: venue.id } }),
      prisma.hold.count({ where: { venueId: venue.id } }),
    ]);

    console.log(
      `Seeded ${venue.name} (${venue.timezone}) tables=${tables} reservations=${reservations} holds=${holds}`,
    );
  }

  await seedApiKeys();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function hashApiKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function seedApiKeys() {
  const devPlaintext = 'dev-local-key';
  await prisma.apiKey.upsert({
    where: { id: 'dev-local' },
    update: {
      name: 'Development Console',
      hashedKey: hashApiKey(devPlaintext),
      isActive: true,
      rateLimitPerMin: 120,
      burstLimit: 60,
      scopeJSON: ['default', 'admin'],
    },
    create: {
      id: 'dev-local',
      name: 'Development Console',
      hashedKey: hashApiKey(devPlaintext),
      isActive: true,
      rateLimitPerMin: 120,
      burstLimit: 60,
      scopeJSON: ['default', 'admin'],
    },
  });
}

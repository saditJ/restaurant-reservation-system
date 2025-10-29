import {
  HoldStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';

export const BLOCKING_RESERVATION_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.SEATED,
];

export type SlotConflictCheckInput = {
  venueId: string;
  tableId?: string | null;
  tableIds?: string[] | null;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: Date;
  durationMinutes: number;
  excludeReservationId?: string | null;
  excludeHoldId?: string | null;
  now?: Date;
};

export type SlotConflicts = {
  reservations: Array<{
    id: string;
    code: string | null;
    status: ReservationStatus;
    tableId: string | null;
    tableIds: string[];
    slotLocalDate: string;
    slotLocalTime: string;
    slotStartUtc: Date;
    durationMinutes: number | null;
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

function tableMatches(
  requestedTables: Set<string>,
  existingTables: Array<string | null>,
) {
  if (requestedTables.size === 0) {
    // Tableless request must be exclusive across the venue.
    return true;
  }
  if (existingTables.length === 0) {
    return true;
  }
  if (existingTables.some((value) => value === null)) {
    // Tableless existing entries block any specific table.
    return true;
  }
  return existingTables.some(
    (value) => value !== null && requestedTables.has(value),
  );
}

export async function findSlotConflicts(
  tx: Prisma.TransactionClient,
  params: SlotConflictCheckInput,
): Promise<SlotConflicts> {
  const {
    venueId,
    tableId = null,
    tableIds = null,
    slotLocalDate,
    slotLocalTime,
    slotStartUtc,
    durationMinutes,
    excludeReservationId,
    excludeHoldId,
  } = params;
  const now = params.now ?? new Date();
  const targetStart = slotStartUtc;
  const targetEnd = new Date(targetStart.getTime() + durationMinutes * 60_000);
  const requestedTables = new Set(
    (tableIds ?? (tableId ? [tableId] : []))
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value),
  );

  const reservationWhere: Prisma.ReservationWhereInput = {
    venueId,
    status: { in: BLOCKING_RESERVATION_STATUSES },
    slotLocalDate,
    slotLocalTime,
  };
  if (excludeReservationId) {
    reservationWhere.id = { not: excludeReservationId };
  }
  if (requestedTables.size > 0) {
    const list = Array.from(requestedTables);
    reservationWhere.OR = [
      { tableId: { in: list } },
      { tables: { some: { tableId: { in: list } } } },
      { tableId: null },
    ];
  }

  const reservations = await tx.reservation.findMany({
    where: reservationWhere,
    select: {
      id: true,
      code: true,
      status: true,
      tableId: true,
      slotStartUtc: true,
      durationMinutes: true,
      slotLocalDate: true,
      slotLocalTime: true,
      tables: {
        select: {
          tableId: true,
        },
      },
    },
  });

  const holdWhere: Prisma.HoldWhereInput = {
    venueId,
    status: HoldStatus.HELD,
    slotLocalDate,
    slotLocalTime,
    expiresAt: { gt: now },
  };
  if (excludeHoldId) {
    holdWhere.id = { not: excludeHoldId };
  }
  if (requestedTables.size > 0) {
    const list = Array.from(requestedTables);
    holdWhere.OR = [{ tableId: { in: list } }, { tableId: null }];
  }

  const holds = await tx.hold.findMany({
    where: holdWhere,
    select: {
      id: true,
      tableId: true,
      slotStartUtc: true,
      expiresAt: true,
      status: true,
      slotLocalDate: true,
      slotLocalTime: true,
    },
  });

  const conflictingReservations = reservations.filter((reservation) => {
    const reservationTables = [
      reservation.tableId ?? null,
      ...reservation.tables.map((assignment) => assignment.tableId ?? null),
    ];
    if (!tableMatches(requestedTables, reservationTables)) return false;
    const existingEnd = new Date(
      reservation.slotStartUtc.getTime() +
        (Number(reservation.durationMinutes) || durationMinutes) * 60_000,
    );
    return reservation.slotStartUtc < targetEnd && targetStart < existingEnd;
  });

  const conflictingHolds = holds.filter((hold) => {
    const holdTables = [hold.tableId ?? null];
    if (!tableMatches(requestedTables, holdTables)) return false;
    return hold.slotStartUtc < targetEnd && targetStart < hold.expiresAt;
  });

  return {
    reservations: conflictingReservations.map((reservation) => ({
      id: reservation.id,
      code: reservation.code ?? null,
      status: reservation.status,
      tableId: reservation.tableId ?? null,
      tableIds: [
        ...new Set(
          [
            reservation.tableId ?? undefined,
            ...reservation.tables.map((assignment) => assignment.tableId),
          ].filter((value): value is string => !!value),
        ),
      ],
      slotLocalDate: reservation.slotLocalDate,
      slotLocalTime: reservation.slotLocalTime,
      slotStartUtc: reservation.slotStartUtc,
      durationMinutes: reservation.durationMinutes,
    })),
    holds: conflictingHolds.map((hold) => ({
      id: hold.id,
      tableId: hold.tableId ?? null,
      status: hold.status,
      slotLocalDate: hold.slotLocalDate,
      slotLocalTime: hold.slotLocalTime,
      slotStartUtc: hold.slotStartUtc,
      expiresAt: hold.expiresAt,
    })),
  };
}

export function hasSlotConflicts(conflicts: SlotConflicts): boolean {
  return conflicts.reservations.length > 0 || conflicts.holds.length > 0;
}



import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import {
  BLOCKING_RESERVATION_STATUSES,
  findSlotConflicts,
  hasSlotConflicts,
} from './utils/booking-conflicts';
import { syncReservationTableAssignments } from './utils/sync-table-assignments';
import { ReservationsService, ReservationDto } from './reservations.service';

type ReservationWithAssignments = Prisma.ReservationGetPayload<{
  include: {
    tables: true;
  };
}>;

type VenueTable = Prisma.TableGetPayload<{
  select: {
    id: true;
    label: true;
    capacity: true;
    area: true;
    zone: true;
    joinGroupId: true;
  };
}>;

type TableEntry = {
  table: VenueTable;
  wear: number;
};

type AvailableTable = {
  table: VenueTable;
  available: boolean;
};

export type SeatingSuggestionTable = {
  tableId: string;
  label: string | null;
  capacity: number;
  area: string | null;
  zone: string | null;
  joinGroupId: string | null;
  wear: number;
};

export type SeatingSuggestion = {
  tableIds: string[];
  tables: SeatingSuggestionTable[];
  totalCapacity: number;
  splitCount: number;
  excessCapacity: number;
  wear: {
    total: number;
    max: number;
  };
  score: number;
  explanation: string;
};

export type SeatingSuggestionsResponse = {
  reservationId: string;
  partySize: number;
  slot: {
    date: string;
    time: string;
  };
  generatedAt: string;
  suggestions: SeatingSuggestion[];
};

const SCORE_WEAR_MAX = 100_000;
const SCORE_WEAR_TOTAL = 1_000;
const SCORE_SPLIT = 100;
const SCORE_EXCESS = 1;

@Injectable()
export class SeatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
  ) {}

  async suggest(
    reservationId: string,
    limit = 3,
  ): Promise<SeatingSuggestionsResponse> {
    const reservation = await this.loadReservation(reservationId);
    const partySize = reservation.partySize;

    const tables = await this.prisma.table.findMany({
      where: { venueId: reservation.venueId },
      select: {
        id: true,
        label: true,
        capacity: true,
        area: true,
        zone: true,
        joinGroupId: true,
      },
      orderBy: [{ capacity: 'asc' }, { label: 'asc' }],
    });

    if (tables.length === 0) {
      return {
        reservationId,
        partySize,
        slot: {
          date: reservation.slotLocalDate,
          time: reservation.slotLocalTime,
        },
        generatedAt: new Date().toISOString(),
        suggestions: [],
      };
    }

    const usage = await this.countTableUsage(
      reservation,
      reservationId,
    );

    const availability = await this.computeAvailability(reservation, tables);

    const availableSingles = availability.filter(
      (entry) =>
        entry.available && entry.table.capacity >= partySize,
    );

    const candidates: SeatingSuggestion[] = [];

    for (const entry of availableSingles) {
      const tableEntry: TableEntry = {
        table: entry.table,
        wear: usage.get(entry.table.id) ?? 0,
      };
      candidates.push(this.buildSuggestion(reservation, [tableEntry], usage));
    }

    const combos = this.buildJoinGroupCombos(
      reservation,
      availability,
      usage,
    );
    candidates.push(...combos);

    const sorted = candidates
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        if (a.splitCount !== b.splitCount) return a.splitCount - b.splitCount;
        if (a.totalCapacity !== b.totalCapacity) {
          return a.totalCapacity - b.totalCapacity;
        }
        return a.tableIds.join(',').localeCompare(b.tableIds.join(','));
      })
      .slice(0, Math.max(1, limit));

    return {
      reservationId,
      partySize,
      slot: {
        date: reservation.slotLocalDate,
        time: reservation.slotLocalTime,
      },
      generatedAt: new Date().toISOString(),
      suggestions: sorted,
    };
  }

  async assignTables(
    reservationId: string,
    tableIds: string[],
  ): Promise<ReservationDto> {
    const normalized = this.normalizeTableIds(tableIds);
    if (normalized.length === 0) {
      throw new BadRequestException('tableIds array is required');
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        venueId: true,
        slotLocalDate: true,
        slotLocalTime: true,
        slotStartUtc: true,
        durationMinutes: true,
        partySize: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const tables = await this.prisma.table.findMany({
      where: {
        venueId: reservation.venueId,
        id: { in: normalized },
      },
      select: {
        id: true,
        capacity: true,
        joinGroupId: true,
      },
    });

    if (tables.length !== normalized.length) {
      throw new BadRequestException('One or more tables do not belong to venue');
    }

    if (normalized.length > 1) {
      const joinGroup = tables[0].joinGroupId;
      if (!joinGroup) {
        throw new BadRequestException('Selected tables cannot be joined');
      }
      const mismatched = tables.some(
        (table) => table.joinGroupId !== joinGroup,
      );
      if (mismatched) {
        throw new BadRequestException(
          'Joined tables must share the same joinGroupId',
        );
      }
    }

    const totalCapacity = tables.reduce(
      (sum, table) => sum + table.capacity,
      0,
    );
    if (totalCapacity < reservation.partySize) {
      throw new BadRequestException(
        'Selected tables do not meet party size capacity',
      );
    }

    const duration =
      Number(reservation.durationMinutes) > 0
        ? Number(reservation.durationMinutes)
        : 120;

    const primaryTableId = normalized[0] ?? null;

    await this.prisma.$transaction(
      async (tx) => {
        await this.acquireLocks(
          tx,
          reservation.venueId,
          reservation.slotLocalDate,
          reservation.slotLocalTime,
          normalized,
        );

        const conflicts = await findSlotConflicts(tx, {
          venueId: reservation.venueId,
          tableId: primaryTableId,
          tableIds: normalized,
          slotLocalDate: reservation.slotLocalDate,
          slotLocalTime: reservation.slotLocalTime,
          slotStartUtc: reservation.slotStartUtc,
          durationMinutes: duration,
          excludeReservationId: reservation.id,
        });

        if (hasSlotConflicts(conflicts)) {
          throw new ConflictException('Requested tables are no longer available');
        }

        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            tableId: primaryTableId,
          },
        });

        await syncReservationTableAssignments(
          tx,
          reservationId,
          normalized,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.reservations.get(reservationId);
  }

  private async loadReservation(
    reservationId: string,
  ): Promise<ReservationWithAssignments> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        tables: true,
      },
    });
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }
    return reservation;
  }

  private async computeAvailability(
    reservation: ReservationWithAssignments,
    tables: VenueTable[],
  ): Promise<AvailableTable[]> {
    const duration =
      Number(reservation.durationMinutes) > 0
        ? Number(reservation.durationMinutes)
        : 120;

    return Promise.all(
      tables.map(async (table) => {
        const conflicts = await findSlotConflicts(this.prisma, {
          venueId: reservation.venueId,
          tableId: table.id,
          slotLocalDate: reservation.slotLocalDate,
          slotLocalTime: reservation.slotLocalTime,
          slotStartUtc: reservation.slotStartUtc,
          durationMinutes: duration,
          excludeReservationId: reservation.id,
        });
        return {
          table,
          available: !hasSlotConflicts(conflicts),
        };
      }),
    );
  }

  private buildSuggestion(
    reservation: ReservationWithAssignments,
    tables: TableEntry[],
    usage: Map<string, number>,
  ): SeatingSuggestion {
    const partySize = reservation.partySize;
    const tableSummaries = tables.map((entry) => {
      const wear = usage.get(entry.table.id) ?? 0;
      return {
        tableId: entry.table.id,
        label: entry.table.label ?? null,
        capacity: entry.table.capacity,
        area: entry.table.area ?? null,
        zone: entry.table.zone ?? null,
        joinGroupId: entry.table.joinGroupId ?? null,
        wear,
      };
    });

    const totalCapacity = tableSummaries.reduce(
      (sum, current) => sum + current.capacity,
      0,
    );
    const splitCount = tableSummaries.length;
    const wearValues = tableSummaries.map((table) => table.wear);
    const wearTotal = wearValues.reduce((sum, value) => sum + value, 0);
    const wearMax = wearValues.length > 0 ? Math.max(...wearValues) : 0;
    const excessCapacity = Math.max(0, totalCapacity - partySize);

    const score =
      wearMax * SCORE_WEAR_MAX +
      wearTotal * SCORE_WEAR_TOTAL +
      splitCount * SCORE_SPLIT +
      excessCapacity * SCORE_EXCESS;

    return {
      tableIds: tableSummaries.map((table) => table.tableId),
      tables: tableSummaries,
      totalCapacity,
      splitCount,
      excessCapacity,
      wear: {
        total: wearTotal,
        max: wearMax,
      },
      score,
      explanation: this.buildExplanation(
        tableSummaries,
        partySize,
        excessCapacity,
      ),
    };
  }

  private buildExplanation(
    tables: SeatingSuggestionTable[],
    partySize: number,
    excessCapacity: number,
  ) {
    if (tables.length === 1) {
      const [table] = tables;
      const spare =
        excessCapacity === 0
          ? 'exact fit'
          : `+${excessCapacity} spare`;
      return `Table ${table.label ?? table.tableId} (capacity ${table.capacity}, used ${table.wear}x today) for party of ${partySize} (${spare}).`;
    }
    const summary = tables
      .map(
        (table) =>
          `${table.label ?? table.tableId} (${table.capacity}, ${table.wear}x)`,
      )
      .join(' + ');
    const spare =
      excessCapacity === 0
        ? 'exact fit'
        : `+${excessCapacity} spare`;
    return `Joined tables ${summary} cover party of ${partySize} (${spare}).`;
  }

  private buildJoinGroupCombos(
    reservation: ReservationWithAssignments,
    availability: AvailableTable[],
    usage: Map<string, number>,
  ) {
    const byGroup = new Map<string, TableEntry[]>();
    for (const entry of availability) {
      if (!entry.available) continue;
      const groupId = entry.table.joinGroupId;
      if (!groupId) continue;
      const list = byGroup.get(groupId) ?? [];
      list.push({
        table: entry.table,
        wear: usage.get(entry.table.id) ?? 0,
      });
      byGroup.set(groupId, list);
    }

    const results: SeatingSuggestion[] = [];
    for (const tables of byGroup.values()) {
      if (tables.length < 2) continue;
      const sorted = tables.slice().sort((a, b) => {
        if (a.table.capacity !== b.table.capacity) {
          return a.table.capacity - b.table.capacity;
        }
        return (a.table.label ?? a.table.id).localeCompare(
          b.table.label ?? b.table.id,
        );
      });
      const combos = this.findMinimalCombos(
        sorted,
        reservation.partySize,
      );
      for (const combo of combos) {
        results.push(this.buildSuggestion(reservation, combo, usage));
      }
    }
    return results;
  }

  private findMinimalCombos(
    tables: TableEntry[],
    partySize: number,
  ): TableEntry[][] {
    const results: TableEntry[][] = [];
    for (let size = 2; size <= tables.length; size += 1) {
      const combos = this.combinationsOfSize(tables, size).filter(
        (combo) =>
          combo.reduce(
            (sum, entry) => sum + entry.table.capacity,
            0,
          ) >= partySize,
      );
      if (combos.length > 0) {
        results.push(...combos);
        break;
      }
    }
    return results;
  }

  private combinationsOfSize<T>(items: T[], size: number): T[][] {
    if (size === 1) {
      return items.map((item) => [item]);
    }
    const results: T[][] = [];
    for (let i = 0; i <= items.length - size; i += 1) {
      const head = items[i];
      const tailCombos = this.combinationsOfSize(
        items.slice(i + 1),
        size - 1,
      );
      for (const tail of tailCombos) {
        results.push([head, ...tail]);
      }
    }
    return results;
  }

  private async countTableUsage(
    reservation: ReservationWithAssignments,
    excludeReservationId: string,
  ) {
    const assignments = await this.prisma.reservationTableAssignment.findMany({
      where: {
        reservationId: { not: excludeReservationId },
        reservation: {
          venueId: reservation.venueId,
          slotLocalDate: reservation.slotLocalDate,
          status: { in: BLOCKING_RESERVATION_STATUSES },
        },
      },
      select: {
        tableId: true,
      },
    });
    const counts = new Map<string, number>();
    for (const row of assignments) {
      counts.set(row.tableId, (counts.get(row.tableId) ?? 0) + 1);
    }
    return counts;
  }

  private normalizeTableIds(tableIds: string[]) {
    return Array.from(
      new Set(
        tableIds
          .map((value) => value?.trim())
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
      ),
    ).sort();
  }

  private async acquireLocks(
    tx: Prisma.TransactionClient,
    venueId: string,
    date: string,
    time: string,
    tableIds: string[],
  ) {
    if (tableIds.length === 0) {
      const key = this.buildSlotLockKey(venueId, null, date, time);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      return;
    }
    for (const tableId of tableIds) {
      const key = this.buildSlotLockKey(venueId, tableId, date, time);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    }
  }

  private buildSlotLockKey(
    venueId: string,
    tableId: string | null,
    date: string,
    time: string,
  ) {
    return `${venueId}::${tableId ?? 'ANY'}::${date}::${time}`;
  }
}






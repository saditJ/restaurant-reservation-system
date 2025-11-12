import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HoldStatus,
  Prisma,
  ReservationStatus,
  Table,
  Venue,
} from '@prisma/client';
import {
  FloorplanTableDto,
  UpdateFloorplanDto,
} from './dto/update-floorplan.dto';
import { PrismaService } from '../prisma.service';

type FloorplanShape = 'rect' | 'circle' | 'booth';

export type FloorplanRoom = {
  w: number;
  h: number;
  grid: number;
};

export type FloorplanTable = {
  id: string;
  name: string;
  min: number;
  max: number;
  x: number;
  y: number;
  angle: number;
  shape: FloorplanShape;
  w: number;
  h: number;
  zone: string | null;
};

export type FloorplanResponse = {
  room: FloorplanRoom;
  tables: FloorplanTable[];
};

export type FloorplanOccupancyResponse = {
  busyTableIds: string[];
  holdsTableIds: string[];
};

type NormalizedTableInput = {
  id: string;
  name: string;
  min: number;
  max: number;
  x: number;
  y: number;
  angle: number;
  shape: FloorplanShape;
  w: number;
  h: number;
  zone: string | null;
};

const MAX_DIMENSION = 5000;
const MAX_TABLES_PER_VENUE = 400;
const DEFAULT_ROOM = {
  w: 1200,
  h: 800,
  grid: 20,
} as const;
const ALLOWED_SHAPES: FloorplanShape[] = ['rect', 'circle', 'booth'];
const OCCUPANCY_LOOKBACK_HOURS = 12;

@Injectable()
export class FloorplanService {
  constructor(private readonly prisma: PrismaService) {}

  async getFloorplan(
    venueId: string,
    tenantId?: string,
  ): Promise<FloorplanResponse> {
    const venue = await this.ensureVenue(venueId, tenantId);
    const tables = await this.prisma.table.findMany({
      where: { venueId: venue.id },
      orderBy: { label: 'asc' },
    });
    return {
      room: this.mapRoom(venue),
      tables: tables.map((table) => this.mapTable(table)),
    };
  }

  async updateFloorplan(
    venueId: string,
    tenantId: string | undefined,
    dto: UpdateFloorplanDto,
  ): Promise<FloorplanResponse> {
    const venue = await this.ensureVenue(venueId, tenantId);
    const tablesInput = Array.isArray(dto.tables) ? dto.tables : null;
    if (tablesInput && tablesInput.length > MAX_TABLES_PER_VENUE) {
      throw new BadRequestException(
        `Cannot manage more than ${MAX_TABLES_PER_VENUE} tables per venue`,
      );
    }

    const roomUpdate = this.buildRoomUpdate(dto.room);
    const shouldSyncTables = Array.isArray(tablesInput);
    const existingTables = shouldSyncTables
      ? await this.prisma.table.findMany({
          where: { venueId: venue.id },
        })
      : [];
    const existingMap = new Map(
      existingTables.map((table) => [table.id, table]),
    );
    const processedIds = new Set<string>();
    const createPayload: Prisma.TableCreateManyInput[] = [];
    const updatePayload: Array<{ id: string; data: Prisma.TableUpdateInput }> =
      [];
    let deleteIds: string[] = [];

    if (shouldSyncTables && tablesInput) {
      tablesInput.forEach((tableInput, index) => {
        const normalized = this.normalizeTableInput(
          tableInput,
          index,
          existingMap,
        );
        if (processedIds.has(normalized.id)) {
          throw new BadRequestException(
            `Duplicate table id "${normalized.id}" in payload`,
          );
        }
        processedIds.add(normalized.id);
        const existing = existingMap.get(normalized.id);
        if (existing) {
          updatePayload.push({
            id: existing.id,
            data: this.buildTableUpdate(existing, normalized),
          });
          return;
        }
        createPayload.push({
          id: normalized.id,
          venueId: venue.id,
          label: normalized.name,
          capacity: normalized.max,
          minSeating: normalized.min,
          x: normalized.x,
          y: normalized.y,
          angle: normalized.angle,
          shape: normalized.shape,
          w: normalized.w,
          h: normalized.h,
          zone: normalized.zone ?? null,
          area: normalized.zone ?? null,
        });
      });

      deleteIds = existingTables
        .filter((table) => !processedIds.has(table.id))
        .map((table) => table.id);
    }

    const mutations: Prisma.PrismaPromise<unknown>[] = [];
    if (roomUpdate) {
      mutations.push(
        this.prisma.venue.update({
          where: { id: venue.id },
          data: roomUpdate,
        }),
      );
    }
    if (createPayload.length > 0) {
      mutations.push(
        this.prisma.table.createMany({
          data: createPayload,
          skipDuplicates: true,
        }),
      );
    }
    if (updatePayload.length > 0) {
      for (const entry of updatePayload) {
        mutations.push(
          this.prisma.table.update({
            where: { id: entry.id },
            data: entry.data,
          }),
        );
      }
    }
    if (deleteIds.length > 0) {
      mutations.push(
        this.prisma.table.deleteMany({
          where: {
            id: { in: deleteIds },
            venueId: venue.id,
          },
        }),
      );
    }

    if (mutations.length > 0) {
      await this.prisma.$transaction(mutations);
    }

    return this.getFloorplan(venue.id, tenantId);
  }

  async getOccupancySnapshot(
    venueId: string,
    at: Date,
    tenantId?: string,
  ): Promise<FloorplanOccupancyResponse> {
    const venue = await this.ensureVenue(venueId, tenantId);
    const target = at;
    const lookback = new Date(
      target.getTime() - OCCUPANCY_LOOKBACK_HOURS * 60 * 60 * 1000,
    );

    const reservations = await this.prisma.reservation.findMany({
      where: {
        venueId: venue.id,
        status: {
          in: [
            ReservationStatus.PENDING,
            ReservationStatus.CONFIRMED,
            ReservationStatus.SEATED,
          ],
        },
        slotStartUtc: {
          lte: target,
          gte: lookback,
        },
      },
      select: {
        id: true,
        slotStartUtc: true,
        durationMinutes: true,
        tableId: true,
        tables: {
          select: { tableId: true },
        },
      },
    });

    const busyTableIds = new Set<string>();
    for (const reservation of reservations) {
      const start = reservation.slotStartUtc;
      const durationMinutes =
        reservation.durationMinutes ?? venue.defaultDurationMin ?? 120;
      const clampedDuration = Math.max(15, Math.min(durationMinutes, 360));
      const end = new Date(start.getTime() + clampedDuration * 60 * 1000);
      if (target < start || target > end) {
        continue;
      }
      const tableIds = new Set<string>();
      if (reservation.tableId) {
        tableIds.add(reservation.tableId);
      }
      for (const assignment of reservation.tables ?? []) {
        if (assignment.tableId) {
          tableIds.add(assignment.tableId);
        }
      }
      tableIds.forEach((id) => busyTableIds.add(id));
    }

    const holds = await this.prisma.hold.findMany({
      where: {
        venueId: venue.id,
        status: HoldStatus.HELD,
        slotStartUtc: { lte: target },
        expiresAt: { gte: target },
      },
      select: { tableId: true },
    });
    const holdIds = new Set<string>();
    for (const hold of holds) {
      if (hold.tableId) {
        holdIds.add(hold.tableId);
      }
    }

    return {
      busyTableIds: Array.from(busyTableIds),
      holdsTableIds: Array.from(holdIds),
    };
  }

  private mapRoom(venue: Venue): FloorplanRoom {
    return {
      w: this.toPositiveNumber(
        venue.floorplanRoomWidth,
        DEFAULT_ROOM.w,
        DEFAULT_ROOM.w,
      ),
      h: this.toPositiveNumber(
        venue.floorplanRoomHeight,
        DEFAULT_ROOM.h,
        DEFAULT_ROOM.h,
      ),
      grid: this.toPositiveNumber(
        venue.floorplanGridSize,
        DEFAULT_ROOM.grid,
        1,
      ),
    };
  }

  private mapTable(table: Table): FloorplanTable {
    const max = this.toPositiveNumber(table.capacity, 2, 1);
    const min = this.toPositiveNumber(
      table.minSeating,
      Math.min(max, 2),
      1,
      max,
    );
    return {
      id: table.id,
      name: table.label,
      min,
      max,
      x: this.toPositiveNumber(table.x, 0, 0),
      y: this.toPositiveNumber(table.y, 0, 0),
      angle: this.normalizeAngle(table.angle ?? 0),
      shape: this.sanitizeShape(table.shape),
      w: this.toPositiveNumber(
        table.w ?? (table.width ? table.width * 60 : undefined),
        60,
        0,
      ),
      h: this.toPositiveNumber(
        table.h ?? (table.height ? table.height * 60 : undefined),
        60,
        0,
      ),
      zone: table.zone ?? table.area ?? null,
    };
  }

  private buildRoomUpdate(room?: UpdateFloorplanDto['room']) {
    if (!room) {
      return null;
    }
    const data: Prisma.VenueUpdateInput = {};
    if (room.w !== undefined) {
      data.floorplanRoomWidth = this.clampDimension(room.w, 'room.w');
    }
    if (room.h !== undefined) {
      data.floorplanRoomHeight = this.clampDimension(room.h, 'room.h');
    }
    if (room.grid !== undefined) {
      data.floorplanGridSize = this.clampDimension(room.grid, 'room.grid', {
        min: 1,
      });
    }
    return Object.keys(data).length ? data : null;
  }

  private buildTableUpdate(
    existing: Table,
    incoming: NormalizedTableInput,
  ): Prisma.TableUpdateInput {
    return {
      label: incoming.name,
      capacity: incoming.max,
      minSeating: incoming.min,
      x: incoming.x,
      y: incoming.y,
      angle: incoming.angle,
      shape: incoming.shape,
      w: incoming.w,
      h: incoming.h,
      zone: incoming.zone,
      area: incoming.zone,
    };
  }

  private normalizeTableInput(
    input: FloorplanTableDto,
    index: number,
    existing: Map<string, Table>,
  ): NormalizedTableInput {
    const rawId = (input.id ?? '').trim();
    if (!rawId) {
      throw new BadRequestException(
        `tables[${index}].id must be a non-empty string`,
      );
    }
    const current = existing.get(rawId);
    const name =
      (input.name ?? current?.label ?? `Table ${index + 1}`).trim() ||
      `Table ${index + 1}`;
    const max =
      input.max ?? current?.capacity ?? this.toPositiveNumber(undefined, 2, 1);
    const sanitizedMax = this.clampDimension(max, `tables[${index}].max`, {
      min: 1,
    });
    const min = input.min ?? current?.minSeating ?? Math.min(2, sanitizedMax);
    const sanitizedMin = this.clampDimension(
      Math.min(min, sanitizedMax),
      `tables[${index}].min`,
      { min: 1 },
    );
    const legacyWidth =
      current && typeof current.width === 'number'
        ? current.width * 60
        : undefined;
    const legacyHeight =
      current && typeof current.height === 'number'
        ? current.height * 60
        : undefined;
    const width = input.w ?? current?.w ?? legacyWidth ?? 60;
    const height = input.h ?? current?.h ?? legacyHeight ?? 60;
    const zone = (input.zone ?? current?.zone ?? current?.area ?? '').trim();

    return {
      id: rawId,
      name,
      min: sanitizedMin,
      max: sanitizedMax,
      x: this.clampDimension(input.x ?? current?.x ?? 0, `tables[${index}].x`),
      y: this.clampDimension(input.y ?? current?.y ?? 0, `tables[${index}].y`),
      angle: this.normalizeAngle(input.angle ?? current?.angle ?? 0),
      shape: this.sanitizeShape(input.shape ?? current?.shape),
      w: this.clampDimension(width, `tables[${index}].w`),
      h: this.clampDimension(height, `tables[${index}].h`),
      zone: zone.length ? zone : null,
    };
  }

  private clampDimension(
    value: number,
    field: string,
    bounds: { min?: number; max?: number } = {},
  ) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(`${field} must be a finite number`);
    }
    const min = bounds.min ?? 0;
    const max = bounds.max ?? MAX_DIMENSION;
    if (numeric < min || numeric > max) {
      throw new BadRequestException(
        `${field} must be between ${min} and ${max}`,
      );
    }
    return Math.round(numeric);
  }

  private normalizeAngle(value: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const normalized = numeric % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  private sanitizeShape(value?: string | null): FloorplanShape {
    if (!value) {
      return 'rect';
    }
    const normalized = value.trim().toLowerCase();
    return ALLOWED_SHAPES.find((shape) => shape === normalized) ?? 'rect';
  }

  private toPositiveNumber(
    value: number | null | undefined,
    fallback: number,
    min: number,
    max = MAX_DIMENSION,
  ) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    if (numeric < min) return min;
    if (numeric > max) return max;
    return Math.round(numeric);
  }

  private async ensureVenue(venueId: string, tenantId?: string) {
    const id = venueId.trim();
    if (!id) {
      throw new BadRequestException('venueId is required');
    }
    const venue = await this.prisma.venue.findUnique({
      where: { id },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} not found`);
    }
    if (tenantId && venue.tenantId !== tenantId) {
      throw new NotFoundException(`Venue ${id} not found`);
    }
    return venue;
  }
}

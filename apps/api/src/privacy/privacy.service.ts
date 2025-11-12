import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditLogService, AuditMetadata } from '../audit/audit-log.service';
import {
  AnonymizeReason,
  ReservationSnapshot,
  buildAnonymizedFields,
  normalizeEmail,
  redactReservationSnapshot,
} from './anonymizer';
import { deriveEmailSearch } from './pii-crypto';

type ExportReservation = Prisma.ReservationGetPayload<{
  include: {
    venue: { select: { id: true; name: true } };
    hold: {
      include: {
        table: true;
      };
    };
    tables: {
      include: { table: true };
    };
  };
}>;

type ErasureReservation = Prisma.ReservationGetPayload<{
  select: {
    id: true;
    guestName: true;
    guestEmail: true;
    guestPhone: true;
    notes: true;
    status: true;
    slotStartUtc: true;
    piiAnonymizedAt: true;
    piiAnonymizedReason: true;
    piiAnonymizedToken: true;
  };
}>;

export type PrivacyExportResponse = {
  generatedAt: string;
  guest: {
    email: string;
    reservations: Array<{
      id: string;
      venue: { id: string; name: string };
      code: string;
      status: string;
      guestName: string;
      guestEmail: string | null;
      guestPhone: string | null;
      notes: string | null;
      slotLocalDate: string;
      slotLocalTime: string;
      slotStartUtc: string;
      durationMinutes: number;
      createdAt: string;
      updatedAt: string;
      anonymizedAt: string | null;
      anonymizedReason: string | null;
      hold: {
        id: string;
        status: string;
        tableId: string | null;
        slotLocalDate: string;
        slotLocalTime: string;
        slotStartUtc: string;
      } | null;
      tables: Array<{
        tableId: string;
        label: string | null;
        area: string | null;
        zone: string | null;
        capacity: number | null;
      }>;
    }>;
  };
};

export type PrivacyEraseResponse = {
  email: string;
  processed: number;
  anonymized: Array<{
    id: string;
    anonymizedAt: string;
    tokenTail: string | null;
  }>;
  skipped: Array<{
    id: string;
    reason: string;
  }>;
};

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async exportGuestData(
    actor: string,
    email: string,
    audit?: AuditMetadata,
  ): Promise<PrivacyExportResponse> {
    const normalizedEmail = this.normalizeEmailInput(email);
    const searchToken = this.resolveEmailSearch(normalizedEmail);
    const reservations = await this.prisma.reservation.findMany({
      where: { guestEmailSearch: searchToken },
      orderBy: [{ slotStartUtc: 'asc' }, { createdAt: 'asc' }],
      include: {
        venue: { select: { id: true, name: true } },
        hold: { include: { table: true } },
        tables: { include: { table: true } },
      },
    });

    if (reservations.length === 0) {
      throw new NotFoundException('No reservations found for supplied email');
    }

    const payload = this.buildExportPayload(normalizedEmail, reservations);

    await this.audit.record({
      actor,
      action: 'privacy.export',
      resource: this.formatGuestResource(searchToken),
      before: {
        reservationIds: reservations.map((reservation) => reservation.id),
        count: reservations.length,
      },
      after: null,
      route: audit?.route,
      method: audit?.method,
      statusCode: audit?.statusCode ?? 200,
      requestId: audit?.requestId,
      tenantId: audit?.tenantId,
    });

    return payload;
  }

  async eraseGuestData(
    actor: string,
    email: string,
    audit?: AuditMetadata,
  ): Promise<PrivacyEraseResponse> {
    const normalizedEmail = this.normalizeEmailInput(email);
    const searchToken = this.resolveEmailSearch(normalizedEmail);
    const reservations = await this.prisma.reservation.findMany({
      where: { guestEmailSearch: searchToken },
      orderBy: [{ slotStartUtc: 'asc' }],
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        notes: true,
        status: true,
        slotStartUtc: true,
        piiAnonymizedAt: true,
        piiAnonymizedReason: true,
        piiAnonymizedToken: true,
      },
    });

    if (reservations.length === 0) {
      throw new NotFoundException('No reservations found for supplied email');
    }

    const now = new Date();
    const before = reservations.map((reservation) =>
      redactReservationSnapshot(reservation as ReservationSnapshot),
    );

    const updates = reservations
      .filter((reservation) => this.canAnonymizeReservation(reservation, now))
      .map((reservation) => ({
        reservation,
        update: buildAnonymizedFields({
          reservationId: reservation.id,
          normalizedEmail,
          hadEmail: !!reservation.guestEmail,
          hadPhone: !!reservation.guestPhone,
          hadNotes: !!reservation.notes,
          timestamp: now,
          reason: 'manual-erase',
        }),
      }));

    const skipped = this.buildSkippedReservations(reservations, updates, now);

    const results = await this.prisma.$transaction(
      updates.map(({ reservation, update }) =>
        this.prisma.reservation.update({
          where: { id: reservation.id },
          data: {
            guestName: update.guestName,
            guestEmail: update.guestEmail,
            guestPhone: update.guestPhone,
            notes: update.notes,
            piiAnonymizedAt: update.piiAnonymizedAt,
            piiAnonymizedReason: update.piiAnonymizedReason,
            piiAnonymizedToken: update.piiAnonymizedToken,
          },
          select: {
            id: true,
            status: true,
            slotStartUtc: true,
            piiAnonymizedAt: true,
            piiAnonymizedReason: true,
            piiAnonymizedToken: true,
          },
        }),
      ),
    );

    const anonymized = results.map((record) => ({
      id: record.id,
      anonymizedAt: record.piiAnonymizedAt
        ? record.piiAnonymizedAt.toISOString()
        : new Date().toISOString(),
      tokenTail: record.piiAnonymizedToken
        ? record.piiAnonymizedToken.slice(-4)
        : null,
    }));

    await this.audit.record({
      actor,
      action: 'privacy.erase',
      resource: this.formatGuestResource(searchToken),
      before: { reservations: before },
      after: {
        anonymized: results.map((record) =>
          redactReservationSnapshot({
            id: record.id,
            guestName: '',
            guestEmail: null,
            guestPhone: null,
            notes: null,
            status: record.status,
            slotStartUtc: record.slotStartUtc,
            piiAnonymizedAt: record.piiAnonymizedAt ?? now,
            piiAnonymizedReason: record.piiAnonymizedReason ?? 'manual-erase',
            piiAnonymizedToken: record.piiAnonymizedToken ?? null,
          }),
        ),
        skipped,
      },
      route: audit?.route,
      method: audit?.method,
      statusCode: audit?.statusCode ?? 200,
      requestId: audit?.requestId,
      tenantId: audit?.tenantId,
    });

    return {
      email: normalizedEmail,
      processed: reservations.length,
      anonymized,
      skipped,
    };
  }

  async anonymizeReservationById(
    reservationId: string,
    reason: AnonymizeReason,
    normalizedEmail: string | null,
  ): Promise<void> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        guestEmail: true,
        guestPhone: true,
        notes: true,
        status: true,
        slotStartUtc: true,
        piiAnonymizedAt: true,
      },
    });
    if (!reservation) return;
    if (reservation.piiAnonymizedAt) return;

    const now = new Date();
    const update = buildAnonymizedFields({
      reservationId: reservation.id,
      normalizedEmail,
      hadEmail: !!reservation.guestEmail,
      hadPhone: !!reservation.guestPhone,
      hadNotes: !!reservation.notes,
      timestamp: now,
      reason,
    });
    await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        guestName: update.guestName,
        guestEmail: update.guestEmail,
        guestPhone: update.guestPhone,
        notes: update.notes,
        piiAnonymizedAt: update.piiAnonymizedAt,
        piiAnonymizedReason: update.piiAnonymizedReason,
        piiAnonymizedToken: update.piiAnonymizedToken,
      },
    });
  }

  private normalizeEmailInput(email: string): string {
    if (!email) {
      throw new BadRequestException('email is required');
    }
    const normalized = normalizeEmail(email);
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(normalized)) {
      throw new BadRequestException('email must be valid');
    }
    return normalized;
  }

  private resolveEmailSearch(email: string): string {
    const search = deriveEmailSearch(email);
    if (!search) {
      throw new BadRequestException('Unable to derive email search token');
    }
    return search;
  }

  private buildExportPayload(
    email: string,
    reservations: ExportReservation[],
  ): PrivacyExportResponse {
    return {
      generatedAt: new Date().toISOString(),
      guest: {
        email,
        reservations: reservations.map((reservation) => ({
          id: reservation.id,
          venue: {
            id: reservation.venue.id,
            name: reservation.venue.name,
          },
          code: reservation.code,
          status: reservation.status,
          guestName: reservation.guestName,
          guestEmail: reservation.guestEmail ?? null,
          guestPhone: reservation.guestPhone ?? null,
          notes: reservation.notes ?? null,
          slotLocalDate: reservation.slotLocalDate,
          slotLocalTime: reservation.slotLocalTime,
          slotStartUtc: reservation.slotStartUtc.toISOString(),
          durationMinutes: reservation.durationMinutes ?? 0,
          createdAt: reservation.createdAt.toISOString(),
          updatedAt: reservation.updatedAt.toISOString(),
          anonymizedAt: reservation.piiAnonymizedAt
            ? reservation.piiAnonymizedAt.toISOString()
            : null,
          anonymizedReason: reservation.piiAnonymizedReason ?? null,
          hold: reservation.hold
            ? {
                id: reservation.hold.id,
                status: reservation.hold.status,
                tableId: reservation.hold.tableId ?? null,
                slotLocalDate: reservation.hold.slotLocalDate,
                slotLocalTime: reservation.hold.slotLocalTime,
                slotStartUtc: reservation.hold.slotStartUtc.toISOString(),
              }
            : null,
          tables: reservation.tables.map((assignment) => ({
            tableId: assignment.tableId,
            label: assignment.table?.label ?? null,
            area: assignment.table?.area ?? null,
            zone: assignment.table?.zone ?? null,
            capacity: assignment.table?.capacity ?? null,
          })),
        })),
      },
    };
  }

  private canAnonymizeReservation(
    reservation: ErasureReservation,
    now: Date,
  ): boolean {
    if (reservation.piiAnonymizedAt) return false;
    return reservation.slotStartUtc <= now;
  }

  private buildSkippedReservations(
    reservations: ErasureReservation[],
    updates: Array<{ reservation: ErasureReservation }>,
    now: Date,
  ) {
    const updatableIds = new Set(
      updates.map(({ reservation }) => reservation.id),
    );
    return reservations
      .filter((reservation) => !updatableIds.has(reservation.id))
      .map((reservation) => ({
        id: reservation.id,
        reason: reservation.piiAnonymizedAt
          ? 'already-anonymized'
          : reservation.slotStartUtc > now
            ? 'future-reservation'
            : 'policy-restricted',
      }));
  }

  private formatGuestResource(token: string) {
    return `guest:${token}`;
  }
}

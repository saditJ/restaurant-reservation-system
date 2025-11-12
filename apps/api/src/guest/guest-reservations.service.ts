import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus, Venue } from '@prisma/client';

import { AuditLogService } from '../audit/audit-log.service';
import { AvailabilityService } from '../availability.service';
import { UpdateReservationDto } from '../dto/update-reservation.dto';
import { PrismaService } from '../prisma.service';
import {
  LinkTokenAction,
  LinkTokenError,
  LinkTokenPayload,
  LinkTokenService,
} from '../security/link-token.service';
import { buildGuestReservationLinks } from '../utils/guest-links';
import { ReservationsService } from '../reservations.service';
import { GuestRescheduleDto } from './dto/guest-reschedule.dto';

export type GuestReservationSummary = {
  id: string;
  code: string;
  status: ReservationStatus;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  partySize: number;
  guestNameMasked: string;
  venue: {
    id: string;
    name: string;
    timezone: string;
  };
  canReschedule: boolean;
  canCancel: boolean;
  policy: {
    cancelWindowMinutes: number;
    modifyWindowMinutes: number;
    minutesUntilStart: number;
  };
  actions: {
    modifyUrl: string;
    cancelUrl: string;
  };
  token: {
    action: LinkTokenAction;
    expiresAt: string;
  };
};

export type GuestRequestContext = {
  route?: string;
  method?: string;
  requestId?: string;
  tenantId?: string;
  ip?: string;
};

type GuestReservationRecord = {
  id: string;
  code: string;
  status: ReservationStatus;
  guestName: string;
  partySize: number;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: Date;
  venueId: string;
  venue: Venue;
};

@Injectable()
export class GuestReservationsService {
  private readonly reschedulableStatuses = new Set<ReservationStatus>([
    ReservationStatus.PENDING,
    ReservationStatus.CONFIRMED,
  ]);
  private readonly cancellableStatuses = new Set<ReservationStatus>([
    ReservationStatus.PENDING,
    ReservationStatus.CONFIRMED,
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly availability: AvailabilityService,
    private readonly audit: AuditLogService,
    private readonly linkTokens: LinkTokenService,
  ) {}

  async getReservation(token: string): Promise<GuestReservationSummary> {
    const claims = this.verifyToken(token, ['view', 'cancel', 'reschedule']);
    const reservation = await this.fetchReservation(claims.reservationId);
    return this.toGuestSummary(reservation, claims);
  }

  async cancelReservation(
    token: string,
    context: GuestRequestContext,
  ): Promise<GuestReservationSummary> {
    const claims = this.verifyToken(token, 'cancel');
    const reservation = await this.fetchReservation(claims.reservationId);
    if (!this.cancellableStatuses.has(reservation.status)) {
      throw new ConflictException({
        error: {
          code: 'STATUS_NOT_ELIGIBLE',
          message: 'Reservation cannot be cancelled online.',
        },
      });
    }
    this.assertCancelWindow(reservation);
    const before = this.buildAuditSnapshot(reservation);

    await this.reservations.updateStatus(
      reservation.id,
      ReservationStatus.CANCELLED,
      'guest',
    );
    const updated = await this.fetchReservation(reservation.id);

    await this.audit.record({
      actor: 'guest-link',
      action: 'guest.reservation.cancel',
      resource: `reservation:${reservation.id}`,
      before,
      after: this.buildAuditSnapshot(updated),
      route: context.route,
      method: context.method,
      requestId: context.requestId,
      tenantId: context.tenantId,
    });

    return this.toGuestSummary(updated, claims);
  }

  async rescheduleReservation(
    token: string,
    payload: GuestRescheduleDto,
    context: GuestRequestContext,
  ): Promise<GuestReservationSummary> {
    const claims = this.verifyToken(token, 'reschedule');
    const reservation = await this.fetchReservation(claims.reservationId);
    if (!this.reschedulableStatuses.has(reservation.status)) {
      throw new ConflictException({
        error: {
          code: 'STATUS_NOT_ELIGIBLE',
          message: 'Reservation cannot be modified online.',
        },
      });
    }
    this.assertModifyWindow(reservation);

    const targetPartySize =
      payload.partySize !== undefined
        ? this.normalizePartySize(payload.partySize)
        : reservation.partySize;

    const availability = await this.availability.getAvailability({
      venueId: reservation.venueId,
      date: payload.date,
      time: payload.time,
      partySize: targetPartySize,
    });

    if (!availability.tables || availability.tables.length === 0) {
      throw new ConflictException({
        error: {
          code: 'NO_AVAILABILITY',
          message: 'No tables are available for the selected time.',
        },
      });
    }

    const preferredTable = availability.tables[0];
    const before = this.buildAuditSnapshot(reservation);

    const updateDto: UpdateReservationDto = {
      date: payload.date,
      time: payload.time,
      tableId: preferredTable.id,
    };
    if (payload.partySize !== undefined) {
      updateDto.partySize = targetPartySize;
    }

    await this.reservations.update(reservation.id, updateDto, 'staff');
    const updated = await this.fetchReservation(reservation.id);

    await this.audit.record({
      actor: 'guest-link',
      action: 'guest.reservation.reschedule',
      resource: `reservation:${reservation.id}`,
      before,
      after: this.buildAuditSnapshot(updated),
      route: context.route,
      method: context.method,
      requestId: context.requestId,
      tenantId: context.tenantId,
    });

    return this.toGuestSummary(updated, claims);
  }

  private verifyToken(
    token: string,
    allowed: LinkTokenAction | LinkTokenAction[],
  ): LinkTokenPayload {
    try {
      return this.linkTokens.verifyToken(token, allowed);
    } catch (error) {
      if (error instanceof LinkTokenError) {
        const code =
          error.code === 'EXPIRED'
            ? 'TOKEN_EXPIRED'
            : error.code === 'ACTION_NOT_ALLOWED'
              ? 'TOKEN_ACTION_INVALID'
              : 'TOKEN_INVALID';
        const message =
          error.code === 'EXPIRED'
            ? 'This link has expired. Please request a new one.'
            : 'This link is invalid. Please request a fresh email.';
        throw new BadRequestException({
          error: {
            code,
            message,
          },
        });
      }
      throw error;
    }
  }

  private async fetchReservation(id: string): Promise<GuestReservationRecord> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        venue: true,
      },
    });
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }
    return reservation as GuestReservationRecord;
  }

  private toGuestSummary(
    reservation: GuestReservationRecord,
    claims: LinkTokenPayload,
  ): GuestReservationSummary {
    const policy = this.buildPolicy(reservation);
    const links = buildGuestReservationLinks(this.linkTokens, reservation.id);
    return {
      id: reservation.id,
      code: reservation.code,
      status: reservation.status,
      slotLocalDate: reservation.slotLocalDate,
      slotLocalTime: reservation.slotLocalTime,
      slotStartUtc: reservation.slotStartUtc.toISOString(),
      partySize: reservation.partySize,
      guestNameMasked: this.maskName(reservation.guestName),
      venue: {
        id: reservation.venue.id,
        name: reservation.venue.name,
        timezone: reservation.venue.timezone,
      },
      canReschedule:
        this.reschedulableStatuses.has(reservation.status) && policy.canModify,
      canCancel:
        this.cancellableStatuses.has(reservation.status) && policy.canCancel,
      policy: {
        cancelWindowMinutes: policy.cancelWindowMinutes,
        modifyWindowMinutes: policy.modifyWindowMinutes,
        minutesUntilStart: policy.minutesUntilStart,
      },
      actions: {
        modifyUrl: links.modifyUrl,
        cancelUrl: links.cancelUrl,
      },
      token: {
        action: claims.action,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
      },
    };
  }

  private buildPolicy(reservation: GuestReservationRecord) {
    const cancelWindowMinutes = this.normalizeWindow(
      reservation.venue.cancellationWindowMin,
      0,
    );
    const modifyWindowMinutes = this.normalizeWindow(
      reservation.venue.guestCanModifyUntilMin,
      0,
    );
    const minutesUntilStart = this.minutesUntil(reservation.slotStartUtc);
    return {
      cancelWindowMinutes,
      modifyWindowMinutes,
      minutesUntilStart,
      canCancel:
        cancelWindowMinutes === 0 || minutesUntilStart >= cancelWindowMinutes,
      canModify:
        modifyWindowMinutes === 0 || minutesUntilStart >= modifyWindowMinutes,
    };
  }

  private assertModifyWindow(reservation: GuestReservationRecord) {
    const policy = this.buildPolicy(reservation);
    if (!policy.canModify) {
      throw new ConflictException({
        error: {
          code: 'POLICY_WINDOW_CLOSED',
          message: 'Reservation can no longer be modified online.',
        },
      });
    }
  }

  private assertCancelWindow(reservation: GuestReservationRecord) {
    const policy = this.buildPolicy(reservation);
    if (!policy.canCancel) {
      throw new ConflictException({
        error: {
          code: 'POLICY_WINDOW_CLOSED',
          message: 'Reservation can no longer be cancelled online.',
        },
      });
    }
  }

  private buildAuditSnapshot(reservation: GuestReservationRecord) {
    return {
      id: reservation.id,
      code: reservation.code,
      status: reservation.status,
      slotLocalDate: reservation.slotLocalDate,
      slotLocalTime: reservation.slotLocalTime,
      partySize: reservation.partySize,
    };
  }

  private normalizeWindow(value: number | null | undefined, fallback: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return fallback;
    }
    return Math.floor(numeric);
  }

  private minutesUntil(slotStart: Date) {
    return Math.floor((slotStart.getTime() - Date.now()) / 60000);
  }

  private maskName(input: string): string {
    if (!input) return 'Guest';
    return input
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => {
        if (part.length <= 1) return part.toUpperCase();
        const head = part[0]?.toUpperCase() ?? '';
        return `${head}${'*'.repeat(Math.max(part.length - 1, 2))}`;
      })
      .join(' ');
  }

  private normalizePartySize(value: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_PARTY_SIZE',
          message: 'Party size is invalid.',
        },
      });
    }
    return Math.floor(parsed);
  }
}

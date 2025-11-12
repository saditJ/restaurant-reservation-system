import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationOutboxStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  NotificationChannel,
  ReservationNotificationEvent,
} from './notification.types';

type ReservationSnapshot = Prisma.ReservationGetPayload<{
  include: { venue: true };
}>;

type EnqueueOptions = {
  snapshot?: ReservationSnapshot | null;
  scheduledAt?: Date | string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueueReservationEvents(
    reservationId: string,
    events: ReservationNotificationEvent[],
    options: EnqueueOptions = {},
  ): Promise<void> {
    const uniqueEvents = Array.from(new Set(events));
    if (uniqueEvents.length === 0) return;

    let snapshot = options.snapshot ?? null;
    if (!snapshot) {
      snapshot = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { venue: true },
      });
      if (!snapshot) {
        this.logger.warn(
          `Unable to enqueue notifications: reservation ${reservationId} not found`,
        );
        return;
      }
    }

    const targets = this.collectTargets(snapshot);
    if (targets.length === 0) {
      this.logger.debug(
        `Reservation ${reservationId} has no guest contact details; skipping notification events ${uniqueEvents.join(
          ', ',
        )}`,
      );
      return;
    }

    const scheduledAt = this.resolveSchedule(options.scheduledAt);
    const payloadBase = this.buildBasePayload(snapshot);

    const operations = uniqueEvents.flatMap((event) =>
      targets.map(({ channel, contact }) => {
        const payload: Prisma.InputJsonObject = {
          ...payloadBase,
          channel,
          event,
          ...(options.metadata
            ? { metadata: options.metadata as Prisma.InputJsonObject }
            : {}),
        };

        return this.prisma.notificationOutbox.create({
          data: {
            type: `reservation.${event}.${channel}`,
            payload,
            status: NotificationOutboxStatus.PENDING,
            scheduledAt,
            reservation: { connect: { id: snapshot.id } },
            guestContact: contact,
          },
        });
      }),
    );

    if (operations.length === 0) return;

    try {
      await this.prisma.$transaction(operations);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue reservation notifications for ${reservationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private collectTargets(snapshot: ReservationSnapshot) {
    const targets: Array<{ channel: NotificationChannel; contact: string }> =
      [];

    const email = this.normalizeContact(snapshot.guestEmail);
    if (email) {
      targets.push({ channel: 'email', contact: email });
    }

    const phone = this.normalizeContact(snapshot.guestPhone);
    if (phone) {
      targets.push({ channel: 'sms', contact: phone });
    }

    return targets;
  }

  private normalizeContact(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private resolveSchedule(input: EnqueueOptions['scheduledAt']): Date {
    if (input instanceof Date) {
      return input;
    }
    if (typeof input === 'string' && input.trim()) {
      const parsed = new Date(input);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }

  private buildBasePayload(snapshot: ReservationSnapshot) {
    const payload: Prisma.InputJsonObject = {
      reservationId: snapshot.id,
      reservationCode: snapshot.code,
      reservationStatus: snapshot.status,
      guestName: snapshot.guestName,
      guestEmail: this.normalizeContact(snapshot.guestEmail),
      guestPhone: this.normalizeContact(snapshot.guestPhone),
      venueId: snapshot.venueId,
      venueName: snapshot.venue?.name ?? null,
      slotLocalDate: snapshot.slotLocalDate,
      slotLocalTime: snapshot.slotLocalTime,
      slotStartUtc: snapshot.slotStartUtc.toISOString(),
      partySize: snapshot.partySize,
      language: this.resolveLanguage(snapshot.status),
    };
    return payload;
  }

  private resolveLanguage(status: ReservationStatus) {
    // Placeholder: default to English, fall back to Albanian when pending.
    // This can later be driven by venue or guest preferences.
    return status === ReservationStatus.PENDING ? 'al' : 'en';
  }
}

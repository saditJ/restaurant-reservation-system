import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  ReservationWebhookEvent,
  WebhookPayload,
  WebhookReservationSnapshot,
} from './webhook.types';
import { ALL_RESERVATION_EVENTS, toPrismaEvent } from './webhook.events';

type ReservationSnapshot = Prisma.ReservationGetPayload<{
  include: { venue: true };
}>;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueueReservationEvents(
    reservation: ReservationSnapshot,
    events: ReservationWebhookEvent[],
  ): Promise<void> {
    const uniqueEvents = Array.from(new Set(events));
    if (uniqueEvents.length === 0) return;

    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { isActive: true },
      select: { id: true, events: true },
    });

    if (endpoints.length === 0) {
      return;
    }

    const payload = this.buildReservationPayload(reservation);
    const now = new Date();

    const allPrismaEvents = ALL_RESERVATION_EVENTS.map((value) =>
      toPrismaEvent(value),
    );

    const operations = uniqueEvents.flatMap((event) => {
      const eventEnum = toPrismaEvent(event);
      const matching = endpoints.filter((endpoint) =>
        (endpoint.events && endpoint.events.length > 0
          ? endpoint.events
          : allPrismaEvents
        ).includes(eventEnum),
      );
      if (matching.length === 0) {
        return [];
      }
      return matching.map(({ id: endpointId }) =>
        this.prisma.webhookDelivery.create({
          data: {
            endpointId,
            reservationId: reservation.id,
            event: eventEnum,
            payload,
            status: WebhookDeliveryStatus.PENDING,
            nextAttemptAt: now,
          },
        }),
      );
    });

    if (operations.length === 0) {
      return;
    }

    try {
      await this.prisma.$transaction(operations);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to enqueue reservation webhook(s) ${uniqueEvents.join(', ')} for ${reservation.id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private buildReservationPayload(
    reservation: ReservationSnapshot,
  ): Prisma.InputJsonObject {
    const snapshot: WebhookReservationSnapshot = {
      id: reservation.id,
      venueId: reservation.venueId,
      code: reservation.code,
      status: reservation.status,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail ?? null,
      guestPhone: reservation.guestPhone ?? null,
      partySize: reservation.partySize,
      slotLocalDate: reservation.slotLocalDate,
      slotLocalTime: reservation.slotLocalTime,
      slotStartUtc: reservation.slotStartUtc.toISOString(),
      durationMinutes: reservation.durationMinutes,
      notes: reservation.notes ?? null,
      channel: reservation.channel ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
      venue: reservation.venue
        ? {
            id: reservation.venue.id,
            name: reservation.venue.name ?? null,
            timezone: reservation.venue.timezone ?? null,
          }
        : null,
    };

    const payload: WebhookPayload = {
      reservation: snapshot,
    };

    return payload as unknown as Prisma.InputJsonObject;
  }
}

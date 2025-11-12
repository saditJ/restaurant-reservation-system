import { WebhookEvent as PrismaWebhookEvent } from '@prisma/client';
import { ReservationWebhookEvent } from './webhook.types';

export const ALL_RESERVATION_EVENTS: ReservationWebhookEvent[] = [
  'reservation.created',
  'reservation.updated',
  'reservation.cancelled',
  'reservation.seated',
  'reservation.completed',
];

export const RESERVATION_TO_PRISMA_EVENT: Record<
  ReservationWebhookEvent,
  PrismaWebhookEvent
> = {
  'reservation.created': PrismaWebhookEvent.RESERVATION_CREATED,
  'reservation.updated': PrismaWebhookEvent.RESERVATION_UPDATED,
  'reservation.cancelled': PrismaWebhookEvent.RESERVATION_CANCELLED,
  'reservation.seated': PrismaWebhookEvent.RESERVATION_SEATED,
  'reservation.completed': PrismaWebhookEvent.RESERVATION_COMPLETED,
};

export const PRISMA_TO_RESERVATION_EVENT: Record<
  PrismaWebhookEvent,
  ReservationWebhookEvent
> = {
  [PrismaWebhookEvent.RESERVATION_CREATED]: 'reservation.created',
  [PrismaWebhookEvent.RESERVATION_UPDATED]: 'reservation.updated',
  [PrismaWebhookEvent.RESERVATION_CANCELLED]: 'reservation.cancelled',
  [PrismaWebhookEvent.RESERVATION_SEATED]: 'reservation.seated',
  [PrismaWebhookEvent.RESERVATION_COMPLETED]: 'reservation.completed',
};

export function toPrismaEvent(
  event: ReservationWebhookEvent,
): PrismaWebhookEvent {
  return RESERVATION_TO_PRISMA_EVENT[event];
}

export function toReservationEvent(
  event: PrismaWebhookEvent,
): ReservationWebhookEvent {
  return PRISMA_TO_RESERVATION_EVENT[event];
}

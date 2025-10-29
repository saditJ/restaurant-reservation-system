import { ReservationStatus } from '@prisma/client';

export type NotificationChannel = 'email' | 'sms';

export type ReservationNotificationEvent =
  | 'created'
  | 'confirmed'
  | 'modified'
  | 'cancelled'
  | 'reminder';

export type ReservationNotificationPayload = {
  reservationId: string;
  reservationCode: string;
  reservationStatus: ReservationStatus;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  venueId: string;
  venueName: string | null;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  partySize: number;
  language?: string | null;
  channel: NotificationChannel;
  event: ReservationNotificationEvent;
  metadata?: Record<string, unknown>;
};

import { WebhookDeliveryStatus } from '@prisma/client';

export type ReservationWebhookEvent =
  | 'reservation.created'
  | 'reservation.updated'
  | 'reservation.cancelled'
  | 'reservation.seated'
  | 'reservation.completed';

export type WebhookVenueSnapshot = {
  id: string;
  name: string | null;
  timezone: string | null;
};

export type WebhookReservationSnapshot = {
  id: string;
  venueId: string;
  code: string;
  status: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  durationMinutes: number | null;
  notes: string | null;
  channel: string | null;
  createdAt: string;
  updatedAt: string;
  venue?: WebhookVenueSnapshot | null;
};

export type WebhookPayload = {
  reservation: WebhookReservationSnapshot;
};

export type WebhookEndpointDto = {
  id: string;
  url: string;
  description: string | null;
  isActive: boolean;
  events: ReservationWebhookEvent[];
  createdAt: string;
  updatedAt: string;
  secret?: string;
  secretPreview?: WebhookSecretPreview;
};

export type WebhookDeliveryDto = {
  id: string;
  endpointId: string;
  event: ReservationWebhookEvent;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  lastAttemptAt: string;
  deliveredAt: string | null;
  failureReason: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
  payload: WebhookPayload;
  endpoint?: WebhookEndpointDto;
};

export type WebhookDeliveryListResponse = {
  items: WebhookDeliveryDto[];
  total: number;
};

export type WebhookSecretPreview = {
  endpointId: string;
  lastFour: string;
  secretCreatedAt: string;
  secretRotatedAt: string | null;
};

export type WebhookSecretResponse = WebhookSecretPreview;

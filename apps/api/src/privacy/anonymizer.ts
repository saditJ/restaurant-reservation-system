import { createHash } from 'node:crypto';
import type { ReservationStatus } from '@prisma/client';

export type AnonymizeReason = 'manual-erase' | 'retention';

export type ReservationSnapshot = {
  id: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  notes: string | null;
  status: ReservationStatus;
  slotStartUtc: Date;
  piiAnonymizedAt: Date | null;
  piiAnonymizedReason: string | null;
  piiAnonymizedToken: string | null;
};

export type AnonymizedUpdate = {
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  notes: string | null;
  piiAnonymizedAt: Date;
  piiAnonymizedReason: string;
  piiAnonymizedToken: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function computeGuestToken(
  normalizedEmail: string | null,
  reservationId: string,
): string {
  const seed =
    normalizedEmail && normalizedEmail.length > 0
      ? normalizedEmail
      : reservationId;
  return createHash('sha256')
    .update('reserve-platform/privacy/token')
    .update(seed)
    .digest('hex')
    .slice(0, 12);
}

export function buildAnonymizedFields(params: {
  reservationId: string;
  normalizedEmail: string | null;
  hadEmail: boolean;
  hadPhone: boolean;
  hadNotes: boolean;
  timestamp: Date;
  reason: AnonymizeReason;
}): AnonymizedUpdate {
  const token = computeGuestToken(params.normalizedEmail, params.reservationId);
  const guestLabel = token.slice(-4);
  return {
    guestName: `Anonymized Guest ${guestLabel}`,
    guestEmail: params.hadEmail ? `anon+${token}@redacted.invalid` : null,
    guestPhone: params.hadPhone ? `ANON-${token}` : null,
    notes: params.hadNotes ? '[REDACTED]' : null,
    piiAnonymizedAt: params.timestamp,
    piiAnonymizedReason: params.reason,
    piiAnonymizedToken: token,
  };
}

export function redactReservationSnapshot(
  reservation: ReservationSnapshot,
): Record<string, unknown> {
  return {
    id: reservation.id,
    status: reservation.status,
    slotStartUtc: reservation.slotStartUtc.toISOString(),
    anonymizedAt: reservation.piiAnonymizedAt
      ? reservation.piiAnonymizedAt.toISOString()
      : null,
    anonymizedReason: reservation.piiAnonymizedReason ?? null,
    anonymizedTokenTail: reservation.piiAnonymizedToken
      ? reservation.piiAnonymizedToken.slice(-4)
      : null,
  };
}

import '../bootstrap-env';

import { Logger } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { createPrismaWithPii } from '../privacy/prisma-pii';
import {
  buildAnonymizedFields,
  normalizeEmail,
  redactReservationSnapshot,
} from '../privacy/anonymizer';

const prisma = createPrismaWithPii();
const logger = new Logger('PrivacyRetentionWorker');

const BATCH_SIZE = resolveNumber(process.env.PRIVACY_RETENTION_BATCH, 200);
const FINAL_STATUSES = [
  ReservationStatus.COMPLETED,
  ReservationStatus.CANCELLED,
];

async function main() {
  const venues = await prisma.venue.findMany({
    select: { id: true, retainPersonalDataDays: true },
  });

  if (venues.length === 0) {
    logger.warn('No venues configured; skipping retention pass');
    return;
  }

  const now = new Date();
  let totalAnonymized = 0;

  for (const venue of venues) {
    const days = resolveNumber(
      String(venue.retainPersonalDataDays ?? 365),
      365,
    );
    if (days <= 0) continue;

    const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const count = await processVenue(venue.id, threshold);
    if (count > 0) {
      logger.log(
        `Anonymized ${count} reservation(s) for venue ${venue.id} older than ${days} day(s)`,
      );
      totalAnonymized += count;
    }
  }

  logger.log(
    totalAnonymized === 0
      ? 'Retention pass complete; no reservations anonymized'
      : `Retention pass complete; ${totalAnonymized} reservation(s) anonymized`,
  );
}

async function processVenue(venueId: string, cutoff: Date): Promise<number> {
  let total = 0;

  while (true) {
    const reservations = await prisma.reservation.findMany({
      where: {
        venueId,
        status: { in: FINAL_STATUSES },
        slotStartUtc: { lt: cutoff },
        piiAnonymizedAt: null,
      },
      orderBy: [{ slotStartUtc: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
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
      break;
    }

    for (const reservation of reservations) {
      const normalizedEmail = reservation.guestEmail
        ? normalizeEmail(reservation.guestEmail)
        : null;
      const update = buildAnonymizedFields({
        reservationId: reservation.id,
        normalizedEmail,
        hadEmail: !!reservation.guestEmail,
        hadPhone: !!reservation.guestPhone,
        hadNotes: !!reservation.notes,
        timestamp: new Date(),
        reason: 'retention',
      });
      const beforeSnapshot = redactReservationSnapshot(
        reservation,
      ) as Prisma.InputJsonValue;
      const result = await prisma.reservation.update({
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
      });

      await prisma.auditLog.create({
        data: {
          actor: 'worker:privacy-retention',
          action: 'privacy.retention',
          resource: `reservation:${reservation.id}`,
          before: beforeSnapshot,
          after: redactReservationSnapshot({
            id: result.id,
            guestName: '',
            guestEmail: null,
            guestPhone: null,
            notes: null,
            status: result.status,
            slotStartUtc: result.slotStartUtc,
            piiAnonymizedAt: result.piiAnonymizedAt ?? update.piiAnonymizedAt,
            piiAnonymizedReason:
              result.piiAnonymizedReason ?? update.piiAnonymizedReason,
            piiAnonymizedToken:
              result.piiAnonymizedToken ?? update.piiAnonymizedToken,
          }) as Prisma.InputJsonValue,
        },
      });

      total += 1;
    }
  }

  return total;
}

main()
  .catch((error) => {
    logger.error(
      `Retention worker failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function resolveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

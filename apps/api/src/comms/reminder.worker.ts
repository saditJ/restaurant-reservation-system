import '../bootstrap-env';

import { Logger } from '@nestjs/common';
import { CommTemplateKind, ReservationStatus } from '@prisma/client';
import { CommService, ReservationCommDetails } from './comm.service';
import { PrismaService } from '../prisma.service';

const POLL_INTERVAL_MS = 60_000;
const LOOKAHEAD_HOURS = 48;
const BATCH_SIZE = 25;

const logger = new Logger('CommsReminderWorker');
const prisma = new PrismaService();
const comms = new CommService(prisma);

let running = true;

process.on('SIGINT', () => {
  logger.log('Received SIGINT; stopping reminder worker...');
  running = false;
});

process.on('SIGTERM', () => {
  logger.log('Received SIGTERM; stopping reminder worker...');
  running = false;
});

type ReminderCandidate = Awaited<ReturnType<typeof findDueReservations>>[number];

async function main() {
  await prisma.$connect();
  logger.log(
    `Reminder worker started (interval=${POLL_INTERVAL_MS}ms, lookahead=${LOOKAHEAD_HOURS}h, batch=${BATCH_SIZE})`,
  );

  while (running) {
    try {
      const candidates = await findDueReservations();
      if (candidates.length === 0) {
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      logger.log(`Processing ${candidates.length} reminder(s).`);

      for (const reservation of candidates) {
        if (!running) break;
        await handleReminder(reservation);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      logger.error(
        `Reminder cycle failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    await delay(POLL_INTERVAL_MS);
  }
}

async function findDueReservations() {
  const now = new Date();
  const horizon = new Date(
    now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000,
  );

  const rows = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.CONFIRMED,
      reminderSentAt: null,
      guestEmail: { not: null },
      slotStartUtc: { gte: now, lte: horizon },
      venue: { reminderHoursBefore: { not: null } },
    },
    include: {
      venue: true,
    },
    orderBy: { slotStartUtc: 'asc' },
    take: BATCH_SIZE,
  });

  return rows.filter((reservation) => {
    const reminderHours = reservation.venue.reminderHoursBefore;
    if (!reminderHours || reminderHours <= 0) return false;
    const diffMs = reservation.slotStartUtc.getTime() - now.getTime();
    if (diffMs < 0) return false;
    const thresholdMs = reminderHours * 60 * 60 * 1000;
    return diffMs <= thresholdMs;
  });
}

async function handleReminder(reservation: ReminderCandidate) {
  const email = reservation.guestEmail?.trim();
  const now = new Date();

  if (!email) {
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { reminderSentAt: now },
    });
    logger.warn(
      `Skipping reminder for reservation ${reservation.code} (${reservation.id}) because email is missing.`,
    );
    return;
  }

  try {
    await comms.sendReservationEmail({
      kind: CommTemplateKind.REMINDER,
      to: email,
      reservation: buildCommDetails(reservation),
      includeCalendar: true,
    });

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { reminderSentAt: new Date() },
    });

    logger.log(
      `Sent reminder for reservation ${reservation.code} (${reservation.id}).`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    logger.warn(
      `Failed to send reminder for reservation ${reservation.id}: ${message}`,
      error instanceof Error ? error.stack : undefined,
    );
  }
}

function buildCommDetails(
  reservation: ReminderCandidate,
): ReservationCommDetails {
  const baseUrl = resolveCommsBaseUrl();
  const manageUrl = `${baseUrl}/reservations/${reservation.code}`;
  const offerUrl = `${baseUrl}/offers/${reservation.venueId}`;
  return {
    id: reservation.id,
    code: reservation.code,
    guestName: reservation.guestName,
    partySize: reservation.partySize,
    slotStartUtc: reservation.slotStartUtc,
    durationMinutes: reservation.durationMinutes,
    venue: {
      id: reservation.venueId,
      name: reservation.venue.name,
      timezone: reservation.venue.timezone,
    },
    manageUrl,
    offerUrl,
  };
}

function resolveCommsBaseUrl(): string {
  const raw = process.env.COMMS_BASE_URL?.trim();
  if (!raw) return 'https://example.test';
  const normalized = raw.replace(/\s/g, '');
  return normalized.replace(/\/+$/, '') || 'https://example.test';
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main()
  .catch((error) => {
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    logger.error(
      `Reminder worker crashed: ${message}`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

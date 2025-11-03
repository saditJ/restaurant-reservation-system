import '../bootstrap-env';

import { Logger } from '@nestjs/common';
import { CommTemplateKind } from '@prisma/client';
import { Temporal } from '@js-temporal/polyfill';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { CacheService } from '../cache/cache.service';
import { HoldsService } from '../holds.service';
import { AvailabilityPolicyService } from '../availability/policy.service';
import { WaitlistService } from './waitlist.service';
import { CommService } from '../comms/comm.service';
import { AuditLogService } from '../audit/audit-log.service';

const POLL_INTERVAL_MS = 60_000;
const BATCH_SIZE = 10;
const OFFER_TTL_MINUTES = 15;
const LOOKAHEAD_DAYS = 1;
const OFFER_URL_BASE = process.env.WAITLIST_OFFER_BASE_URL?.trim() || 'http://localhost:3002/r';

const logger = new Logger('WaitlistPromoter');
const prisma = new PrismaService();
const metrics = new MetricsService();
const cache = new CacheService();
const holds = new HoldsService(prisma, cache);
const policy = new AvailabilityPolicyService(prisma, metrics);
const waitlist = new WaitlistService(prisma, holds, policy);
const comms = new CommService(prisma, metrics);
const audit = new AuditLogService(prisma);

let running = true;

process.on('SIGINT', () => {
  logger.log('Received SIGINT; stopping waitlist promoter...');
  running = false;
});

process.on('SIGTERM', () => {
  logger.log('Received SIGTERM; stopping waitlist promoter...');
  running = false;
});

async function main() {
  await prisma.$connect();
  await metrics.onModuleInit();
  await cache.onModuleInit();

  logger.log(
    `Waitlist promoter started (poll=${POLL_INTERVAL_MS}ms batch=${BATCH_SIZE} ttl=${OFFER_TTL_MINUTES}m)`,
  );

  while (running) {
    try {
      const candidates = await waitlist.findWaitingEntries(BATCH_SIZE);
      if (candidates.length === 0) {
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      for (const entry of candidates) {
        if (!running) break;
        await processEntry(entry).catch((error) => {
          logger.warn(
            `Failed to process waitlist entry ${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
    } catch (error) {
      logger.error(
        `Waitlist promoter cycle failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    await delay(POLL_INTERVAL_MS);
  }

}

async function processEntry(entry: Awaited<ReturnType<typeof waitlist.findWaitingEntries>>[number]) {
  const slot = await findSlot(entry);
  if (!slot) {
    logger.debug(`No available slots found for waitlist ${entry.id}`);
    return;
  }

  const result = await waitlist.offer(entry.id, {
    slotStart: slot.toISOString(),
    ttlMinutes: OFFER_TTL_MINUTES,
  });

  const email = result.waitlist.email?.trim();
  if (!email) {
    logger.warn(`Waitlist ${entry.id} missing email; skipping communication.`);
    return;
  }

  if (!result.waitlist.offerCode) {
    logger.warn(`Waitlist ${entry.id} missing offer code after offer creation.`);
    return;
  }

  const token = result.waitlist.offerToken?.trim();
  if (!token) {
    logger.warn(`Waitlist ${entry.id} missing offer token after offer creation.`);
    return;
  }

  const offerUrl = buildOfferUrl(result.waitlist.offerCode, token);

  try {
    await comms.sendReservationEmail({
      kind: CommTemplateKind.OFFER,
      to: email,
      reservation: {
        id: result.hold.id,
        code: result.waitlist.offerCode,
        guestName: result.waitlist.name,
        partySize: result.waitlist.partySize,
        slotStartUtc: result.hold.slotStartUtc,
        durationMinutes: Number(entry.venue.defaultDurationMin) || 120,
        venue: {
          id: entry.venueId,
          name: entry.venue.name,
          timezone: entry.venue.timezone,
        },
        manageUrl: offerUrl,
        offerUrl,
        expiresAt: result.hold.expiresAt,
      },
      includeCalendar: false,
    });

    logger.log(`Sent waitlist offer ${result.waitlist.offerCode} to ${email}`);

    try {
      const expiresAtIso =
        result.waitlist.expiresAt ?? result.hold.expiresAt.toISOString();
      await audit.record({
        actor: 'waitlist-promoter',
        action: 'waitlist.offer.sent',
        resource: entry.id,
        after: {
          waitlistId: entry.id,
          holdId: result.hold.id,
          offerCode: result.waitlist.offerCode,
          expiresAt: expiresAtIso,
          guestEmail: email,
          guestName: result.waitlist.name,
          venueId: entry.venueId,
          venueName: entry.venue.name,
          sentAt: new Date().toISOString(),
        },
      });
    } catch (logError) {
      logger.warn(
        `Failed to record offer audit for waitlist ${entry.id}: ${
          logError instanceof Error ? logError.message : String(logError)
        }`,
      );
    }
  } catch (error) {
    logger.warn(
      `Failed to send waitlist offer email for ${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
  }
}

async function findSlot(entry: Awaited<ReturnType<typeof waitlist.findWaitingEntries>>[number]) {
  const timezone = entry.venue.timezone;
  const desiredInstant = Temporal.Instant.from(entry.desiredAt.toISOString());
  const desiredZdt = desiredInstant.toZonedDateTimeISO(timezone);

  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const date = desiredZdt.add({ days: offset }).toPlainDate().toString();
    const policyEval = await policy.evaluateDay({
      venueId: entry.venueId,
      date,
    });

    const orderedSlots = policyEval.slots
      .filter((slot) => slot.remaining >= entry.partySize)
      .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());

    for (const slot of orderedSlots) {
      if (offset === 0 && slot.startUtc.getTime() < entry.desiredAt.getTime()) {
        continue;
      }
      return slot.startUtc;
    }
  }

  return null;
}

function buildOfferUrl(code: string, token: string) {
  const base = OFFER_URL_BASE.replace(/\/$/, '');
  return `${base}/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error) => {
    logger.error(
      `Waitlist promoter crashed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await cache.onModuleDestroy();
    await prisma.$disconnect();
  });


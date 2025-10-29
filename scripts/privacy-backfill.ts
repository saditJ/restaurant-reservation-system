import '../apps/api/src/bootstrap-env';

import { Prisma } from '@prisma/client';
import { createPrismaWithPii } from '../apps/api/src/privacy/prisma-pii';
import {
  deriveEmailSearch,
  derivePhoneSearch,
  getActivePiiKeyVersion,
} from '../apps/api/src/privacy/pii-crypto';

const prisma = createPrismaWithPii();
const BATCH_SIZE = resolveNumber(process.env.PRIVACY_BACKFILL_BATCH, 250);

type ReservationRecord = Prisma.ReservationGetPayload<{
  select: {
    id: true;
    guestEmail: true;
    guestPhone: true;
    guestEmailSearch: true;
    guestPhoneSearch: true;
    guestPhoneLast4: true;
    piiKeyVersion: true;
  };
}>;

async function run() {
  let cursor: string | null = null;
  let processed = 0;
  let updated = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const reservations = await prisma.reservation.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        guestEmail: true,
        guestPhone: true,
        guestEmailSearch: true,
        guestPhoneSearch: true,
        guestPhoneLast4: true,
        piiKeyVersion: true,
      },
    });

    if (reservations.length === 0) {
      break;
    }

    for (const reservation of reservations) {
      processed += 1;
      const data = buildUpdatePayload(reservation);
      if (data) {
        await prisma.reservation.update({
          where: { id: reservation.id },
          data,
        });
        updated += 1;
      }
    }

    cursor = reservations[reservations.length - 1].id;
  }

  await prisma.$disconnect();

  process.stdout.write(
    JSON.stringify(
      {
        processed,
        updated,
        keyVersion: getActivePiiKeyVersion(),
        batchSize: BATCH_SIZE,
      },
      null,
      2,
    ) + '\n',
  );
}

run().catch(async (error) => {
  console.error('Failed to backfill PII', error);
  await prisma.$disconnect();
  process.exit(1);
});

function buildUpdatePayload(
  reservation: ReservationRecord,
): Prisma.ReservationUpdateInput | null {
  const data: Prisma.ReservationUpdateInput = {};
  let dirty = false;

  const emailValue = normalizeNullable(reservation.guestEmail);
  const emailSearch = emailValue ? deriveEmailSearch(emailValue) : null;
  if (emailValue) {
    if (
      reservation.guestEmailSearch !== emailSearch ||
      !reservation.piiKeyVersion
    ) {
      data.guestEmail = emailValue;
      dirty = true;
    }
  } else if (reservation.guestEmailSearch) {
    data.guestEmail = null;
    dirty = true;
  }

  const phoneValue = normalizeNullable(reservation.guestPhone);
  const phoneSearch = phoneValue ? derivePhoneSearch(phoneValue) : null;
  if (phoneValue && phoneSearch) {
    const needsHash =
      reservation.guestPhoneSearch !== phoneSearch.hash ||
      reservation.guestPhoneLast4 !== phoneSearch.last4;
    if (needsHash || !reservation.piiKeyVersion) {
      data.guestPhone = phoneValue;
      dirty = true;
    }
  } else if (
    reservation.guestPhoneSearch ||
    reservation.guestPhoneLast4
  ) {
    data.guestPhone = null;
    dirty = true;
  }

  if (
    !dirty &&
    !reservation.piiKeyVersion &&
    (emailValue || phoneValue)
  ) {
    data.piiKeyVersion = getActivePiiKeyVersion();
    dirty = true;
  }

  return dirty ? data : null;
}

function normalizeNullable(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function resolveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

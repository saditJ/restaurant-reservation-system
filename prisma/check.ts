import { HoldStatus, PrismaClient, ReservationStatus } from '@prisma/client';
import * as prismaPiiModule from '../apps/api/src/privacy/prisma-pii';

// The `prisma-pii` module may be consumed as ESM named exports or a
// CommonJS/default export depending on runtime. Be defensive and accept
// either shape so this script works in CI and locally.
const createPrismaWithPii: (options?: any) => PrismaClient =
  (prismaPiiModule as any).createPrismaWithPii ??
  (prismaPiiModule as any).default?.createPrismaWithPii ??
  (prismaPiiModule as any).default ??
  (prismaPiiModule as any);

const prisma = createPrismaWithPii();

async function main() {
  const venueId = process.env.CHECK_VENUE_ID || 'venue-main';
  const tables = await prisma.table.count({ where: { venueId } });
  const reservations = await prisma.reservation.groupBy({
    by: ['status'],
    where: { venueId },
    _count: true,
  });
  const activeHolds = await prisma.hold.count({
    where: { venueId, status: HoldStatus.HELD, expiresAt: { gt: new Date() } },
  });
  const expirations = await prisma.hold.count({
    where: { venueId, status: HoldStatus.HELD, expiresAt: { lte: new Date() } },
  });

  const summary = {
    venueId,
    tables,
    reservations: Object.fromEntries(
      Object.values(ReservationStatus).map((status) => [
        status,
        reservations.find((r: { status: ReservationStatus; _count?: number }) => r.status === status)?._count ?? 0,
      ]),
    ),
    holds: {
      active: activeHolds,
      stale: expirations,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

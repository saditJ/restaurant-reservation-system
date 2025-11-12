#!/usr/bin/env tsx
/**
 * Re-encrypts reservation PII fields with the active PII key version.
 *
 * Usage:
 *   pnpm tsx scripts/pii-rotate.ts [--dry-run] [--batch=100]
 */

import { Prisma } from '@prisma/client';
import { getActivePiiKeyVersion } from '../apps/api/src/privacy/pii-crypto';
import { createPrismaWithPii } from '../apps/api/src/privacy/prisma-pii';

type RotateOptions = {
  dryRun: boolean;
  batch: number;
};

const prisma = createPrismaWithPii();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetVersion = getActivePiiKeyVersion();

  console.log('PII rotation starting');
  console.log(`  Mode:      ${options.dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`  Batch:     ${options.batch}`);
  console.log(`  Target KV: ${targetVersion}`);

  let processed = 0;
  let updated = 0;
  let cursor: string | null = null;

  while (true) {
    const batch = await prisma.reservation.findMany({
      where: reservationsNeedingRotation(targetVersion),
      orderBy: { id: 'asc' },
      take: options.batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        notes: true,
        piiKeyVersion: true,
      },
    });

    if (batch.length === 0) {
      break;
    }

    cursor = batch[batch.length - 1].id;

    for (const record of batch) {
      processed += 1;
      if (options.dryRun) {
        updated += 1;
        continue;
      }
      await prisma.reservation.update({
        where: { id: record.id },
        data: {
          guestName: record.guestName ?? null,
          guestEmail: record.guestEmail ?? null,
          guestPhone: record.guestPhone ?? null,
          notes: record.notes ?? null,
          piiKeyVersion: targetVersion,
        },
      });
      updated += 1;
    }

    console.log(
      `  Processed ${processed} reservations (${updated} updated so far)`,
    );
  }

  console.log('\nRotation summary');
  console.log(`  Records scanned: ${processed}`);
  console.log(
    `  Records updated: ${updated}${options.dryRun ? ' (simulated)' : ''}`,
  );
  console.log(
    options.dryRun
      ? 'Dry run complete – re-run without --dry-run to apply changes.'
      : 'Rotation complete.',
  );

  await prisma.$disconnect();
}

function reservationsNeedingRotation(targetVersion: string): Prisma.ReservationWhereInput {
  return {
    OR: [
      { piiKeyVersion: null },
      { piiKeyVersion: { not: targetVersion } },
    ],
  };
}

function parseArgs(args: string[]): RotateOptions {
  const options: RotateOptions = {
    dryRun: false,
    batch: 100,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--batch=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.batch = Math.floor(value);
      }
    }
  }

  return options;
}

main().catch((error) => {
  console.error('PII rotation failed:', error);
  process.exitCode = 1;
});

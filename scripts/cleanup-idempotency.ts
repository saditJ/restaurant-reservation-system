#!/usr/bin/env tsx
/**
 * Cleanup script for expired idempotency keys
 * Usage: tsx scripts/cleanup-idempotency.ts
 * 
 * Can be run via cron or scheduled task:
 * 0 * * * * cd /app && tsx scripts/cleanup-idempotency.ts
 */

import '../apps/api/src/bootstrap-env';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('[cleanup-idempotency] Starting cleanup...');
    
    const now = new Date();
    const result = await prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    console.log(`[cleanup-idempotency] Deleted ${result.count} expired idempotency keys`);
    
    // Also clean up very old entries (>30 days) as a safety measure
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oldResult = await prisma.idempotencyKey.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    if (oldResult.count > 0) {
      console.log(`[cleanup-idempotency] Deleted ${oldResult.count} very old idempotency keys (>30 days)`);
    }

    console.log('[cleanup-idempotency] Cleanup complete');
  } catch (error) {
    console.error('[cleanup-idempotency] Cleanup failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

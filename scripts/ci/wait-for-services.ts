import { setTimeout as delay } from 'node:timers/promises';
import { createPrismaWithPii } from '../../apps/api/src/privacy/prisma-pii';
import Redis from 'ioredis';

const DEFAULT_RETRIES = Number(process.env.CI_WAIT_RETRIES ?? 30);
const DEFAULT_DELAY_MS = Number(process.env.CI_WAIT_DELAY_MS ?? 2_000);

async function checkPostgres() {
  const prisma = createPrismaWithPii();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } finally {
    await prisma.$disconnect();
  }
}

async function checkRedis() {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/0';
  const redis = new Redis(url, { lazyConnect: true });
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong.toUpperCase() !== 'PONG') {
      throw new Error(`Unexpected Redis ping response: ${pong}`);
    }
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const retries = Number.isFinite(DEFAULT_RETRIES) ? DEFAULT_RETRIES : 30;
  const delayMs = Number.isFinite(DEFAULT_DELAY_MS) ? DEFAULT_DELAY_MS : 2_000;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await checkPostgres();
      await checkRedis();
      console.log('Postgres and Redis are ready.');
      return;
    } catch (error) {
      const remaining = retries - attempt;
      console.warn(
        `Dependency check failed (attempt ${attempt}/${retries}): ${
          (error as Error).message
        }.${remaining > 0 ? ` Retrying in ${delayMs}ms...` : ''}`,
      );
      if (remaining > 0) {
        await delay(delayMs);
      }
    }
  }

  throw new Error('Postgres/Redis did not become ready in time.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

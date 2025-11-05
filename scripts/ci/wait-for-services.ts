import { setTimeout as delay } from 'timers/promises';
import { createConnection, Socket } from 'net';
import { PrismaClient } from '@prisma/client';
import * as prismaPiiModule from '../../apps/api/src/privacy/prisma-pii';

const createPrismaWithPii: (options?: any) => PrismaClient = 
  (prismaPiiModule as any).createPrismaWithPii ??
  (prismaPiiModule as any).default?.createPrismaWithPii ??
  (prismaPiiModule as any).default ??
  (prismaPiiModule as any);

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
  const urlString = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/0';
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch (error) {
    throw new Error(
      `Invalid REDIS_URL "${urlString}": ${(error as Error).message}`,
    );
  }

  const host = parsed.hostname || '127.0.0.1';
  const port = parsed.port ? Number(parsed.port) : 6379;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid Redis port in REDIS_URL: "${parsed.port ?? ''}"`);
  }

  const password =
    parsed.password && parsed.password.length > 0
      ? decodeURIComponent(parsed.password)
      : null;
  const db =
    parsed.pathname && parsed.pathname.length > 1
      ? Number.parseInt(parsed.pathname.slice(1), 10)
      : null;

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;
    let buffer = '';

    const cleanup = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.setTimeout(0);
      if (!socket.destroyed) {
        socket.end();
        socket.destroy();
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const send = (command: string) => {
      socket.write(`${command}\r\n`);
    };

    socket.setTimeout(5_000, () => {
      cleanup(new Error('Redis connection timed out'));
    });

    socket.on('error', (error: Error | any) => {
      cleanup(
        error instanceof Error ? error : new Error(String(error ?? 'error')),
      );
    });

    socket.on('close', () => {
      cleanup(new Error('Redis connection closed before readiness detected'));
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');

      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (!line) continue;

        if (line.startsWith('-')) {
          cleanup(new Error(`Redis error response: ${line}`));
          return;
        }

        if (line.startsWith('+PONG')) {
          cleanup();
          return;
        }
      }
    });

    socket.on('connect', () => {
      if (password) {
        send(`AUTH ${password}`);
      }
      if (db !== null && Number.isFinite(db) && db >= 0) {
        send(`SELECT ${db}`);
      }
      send('PING');
    });
  });
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

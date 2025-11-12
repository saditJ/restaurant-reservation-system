import '../bootstrap-env';

import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { toReservationEvent } from '../webhooks/webhook.events';
import { WebhookPayload } from '../webhooks/webhook.types';
import { createPrismaWithPii } from '../privacy/prisma-pii';

const prisma = createPrismaWithPii();
const logger = new Logger('WebhooksWorker');

const POLL_INTERVAL_MS = resolveNumber(
  process.env.WEBHOOKS_POLL_INTERVAL_MS,
  5_000,
);
const BATCH_SIZE = resolveNumber(process.env.WEBHOOKS_BATCH_SIZE, 10);
const BACKOFF_SCHEDULE_MS = [0, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;
const USER_AGENT =
  process.env.WEBHOOKS_USER_AGENT ?? 'ReservePlatformWebhook/1.0';

type DeliveryJob = Prisma.WebhookDeliveryGetPayload<{
  include: { endpoint: true };
}>;

let running = true;

async function main() {
  logger.log(
    `Webhooks worker ready (batch=${BATCH_SIZE}, pollInterval=${POLL_INTERVAL_MS}ms, maxAttempts=${MAX_ATTEMPTS})`,
  );

  while (running) {
    try {
      const jobs = await prisma.webhookDelivery.findMany({
        where: {
          status: WebhookDeliveryStatus.PENDING,
          nextAttemptAt: { lte: new Date() },
        },
        include: { endpoint: true },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: BATCH_SIZE,
      });

      if (jobs.length === 0) {
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      for (const job of jobs) {
        if (!running) break;
        try {
          await processJob(job);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `Failed to process delivery ${job.id}: ${message}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      logger.error(`Webhook worker cycle failed: ${message}`);
      await delay(POLL_INTERVAL_MS);
    }
  }

  await prisma.$disconnect();
}

async function processJob(job: DeliveryJob) {
  if (!job.endpoint) {
    logger.warn(`Delivery ${job.id} has no endpoint attached; marking failed`);
    await prisma.webhookDelivery.update({
      where: { id: job.id },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        lastError: 'Missing endpoint',
      },
    });
    return;
  }

  const secret = resolveEndpointSecret(job);
  if (!secret) {
    logger.error(`Delivery ${job.id} missing endpoint secret; marking failed`);
    await prisma.webhookDelivery.update({
      where: { id: job.id },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        lastError: 'Missing endpoint secret',
        failureReason: 'Missing endpoint secret',
        failedAt: new Date(),
      },
    });
    return;
  }

  const attempt = job.attempts + 1;
  const event = toReservationEvent(job.event);
  const payload = extractPayload(job);
  const body = buildBody(job, attempt, event, payload);
  const bodyJson = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureInput = `${timestamp}.${bodyJson}`;
  const signature = createHmac('sha256', secret)
    .update(signatureInput)
    .digest('hex');

  try {
    const response = await fetch(job.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Reserve-Event': event,
        'X-Reserve-Delivery': job.id,
        'X-Reserve-Timestamp': timestamp,
        'X-Reserve-Signature': `t=${timestamp},v1=${signature}`,
        'X-Webhook-Signature': `sha256=${signature}`,
      },
      body: bodyJson,
    });

    if (!response.ok) {
      const text = await safeReadText(response);
      throw new Error(
        `Endpoint responded with ${response.status} ${response.statusText}${
          text ? `: ${text.slice(0, 200)}` : ''
        }`,
      );
    }

    await prisma.webhookDelivery.update({
      where: { id: job.id },
      data: {
        status: WebhookDeliveryStatus.SUCCESS,
        attempts: attempt,
        lastError: null,
        nextAttemptAt: job.nextAttemptAt,
        deliveredAt: new Date(),
        signatureInput,
        failureReason: null,
        failedAt: null,
      },
    });

    logger.log(
      `Webhook ${job.id} delivered to ${job.endpoint.url} (${event}, attempt ${attempt})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetry = attempt < MAX_ATTEMPTS;
    const nextStatus = shouldRetry
      ? WebhookDeliveryStatus.PENDING
      : WebhookDeliveryStatus.FAILED;
    const nextAttemptNumber = attempt + 1;
    const nextAttemptAt = shouldRetry
      ? computeNextSchedule(nextAttemptNumber)
      : job.nextAttemptAt;

    await prisma.webhookDelivery.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        attempts: attempt,
        lastError: message,
        nextAttemptAt,
        signatureInput,
        failureReason: shouldRetry ? null : message,
        failedAt: shouldRetry ? null : new Date(),
      },
    });

    if (shouldRetry) {
      const seconds = Math.round((nextAttemptAt.getTime() - Date.now()) / 1000);
      logger.warn(
        `Webhook ${job.id} attempt ${attempt} failed: ${message}. Retrying in ${seconds}s`,
      );
    } else {
      logger.error(
        `Webhook ${job.id} permanently failed after ${attempt} attempts: ${message}`,
      );
    }
  }
}

function extractPayload(job: DeliveryJob): WebhookPayload {
  const raw = job.payload;
  if (raw && typeof raw === 'object' && raw !== null && 'reservation' in raw) {
    return raw as WebhookPayload;
  }
  const message = `Webhook ${job.id} has invalid payload`;
  throw new Error(message);
}

function buildBody(
  job: DeliveryJob,
  attempt: number,
  event: string,
  payload: WebhookPayload,
) {
  return {
    id: job.id,
    event,
    attempt,
    createdAt: new Date().toISOString(),
    data: payload,
  };
}

async function safeReadText(response: globalThis.Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function resolveEndpointSecret(job: DeliveryJob): string | null {
  if (!job.endpoint) {
    return null;
  }
  const secret = job.endpoint.secret;
  if (!secret) {
    return null;
  }
  const trimmed = secret.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function computeNextSchedule(nextAttemptNumber: number) {
  const index = Math.max(
    0,
    Math.min(nextAttemptNumber - 1, BACKOFF_SCHEDULE_MS.length - 1),
  );
  const delay = BACKOFF_SCHEDULE_MS[index];
  return new Date(Date.now() + delay);
}

function resolveNumber(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerSignalHandlers() {
  const terminate = async (signal: string) => {
    if (!running) return;
    running = false;
    logger.log(`Received ${signal}; shutting down webhooks worker`);
  };

  process.on('SIGINT', () => {
    void terminate('SIGINT');
  });
  process.on('SIGTERM', () => {
    void terminate('SIGTERM');
  });
}

registerSignalHandlers();

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Webhooks worker crashed: ${message}`);
  process.exitCode = 1;
});

import '../bootstrap-env';

import { Logger } from '@nestjs/common';
import { NotificationOutbox, NotificationOutboxStatus } from '@prisma/client';
import type { Request } from 'express';
import { TemplateRenderer } from '../notifications/template.renderer';
import { EmailNotificationProvider } from '../notifications/providers/email.provider';
import { SmsNotificationProvider } from '../notifications/providers/sms.provider';
import {
  ReservationNotificationEvent,
  ReservationNotificationPayload,
} from '../notifications/notification.types';
import { ensureRequestId } from '../common/middleware/request-id.middleware';
import { createPrismaWithPii } from '../privacy/prisma-pii';

const prisma = createPrismaWithPii();
const renderer = new TemplateRenderer();
const emailProvider = new EmailNotificationProvider();
const smsProvider = new SmsNotificationProvider();
const logger = new Logger('NotificationsWorker');

const POLL_INTERVAL_MS = resolveNumber(
  process.env.NOTIFICATIONS_POLL_INTERVAL_MS,
  5_000,
);
const BATCH_SIZE = resolveNumber(process.env.NOTIFICATIONS_BATCH_SIZE, 10);
const MAX_ATTEMPTS = resolveNumber(process.env.NOTIFICATIONS_MAX_ATTEMPTS, 5);

let running = true;

async function main() {
  logger.log(
    `Notifications worker booted (batchSize=${BATCH_SIZE}, pollInterval=${POLL_INTERVAL_MS}ms, maxAttempts=${MAX_ATTEMPTS})`,
  );
  while (running) {
    const cycleId = generateRequestId();
    try {
      if (!isNotificationsEnabled()) {
        logger.warn(
          `[request_id=${cycleId}] NOTIFICATIONS_ENABLED=false -> skipped send cycle`,
        );
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      const jobs = await prisma.notificationOutbox.findMany({
        where: {
          status: NotificationOutboxStatus.PENDING,
          scheduledAt: { lte: new Date() },
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        take: BATCH_SIZE,
      });

      if (jobs.length === 0) {
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      logger.log(
        `[request_id=${cycleId}] Processing ${jobs.length} notification(s)`,
      );

      for (const job of jobs) {
        if (!running) break;
        await processJob(job, cycleId);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      logger.error(
        `[request_id=${cycleId}] Worker cycle failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await delay(POLL_INTERVAL_MS);
    }
  }
  await prisma.$disconnect();
}

async function processJob(job: NotificationOutbox, cycleRequestId: string) {
  const attempt = job.attempts + 1;
  const startedAt = Date.now();
  try {
    const payload = parsePayload(job);
    await deliver(job, payload);
    await prisma.notificationOutbox.update({
      where: { id: job.id },
      data: {
        status: NotificationOutboxStatus.SENT,
        attempts: attempt,
        lastError: null,
      },
    });
    logger.log(
      `[request_id=${cycleRequestId}] Notification ${job.id} sent (${payload.event}/${payload.channel}) to ${job.guestContact} in ${Date.now() - startedAt}ms`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldDeadLetter = attempt >= MAX_ATTEMPTS;
    const nextStatus = shouldDeadLetter
      ? NotificationOutboxStatus.FAILED
      : NotificationOutboxStatus.PENDING;
    const nextSchedule = shouldDeadLetter
      ? job.scheduledAt
      : computeNextSchedule(attempt);

    await prisma.notificationOutbox.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        attempts: attempt,
        lastError: message,
        ...(shouldDeadLetter ? {} : { scheduledAt: nextSchedule }),
      },
    });

    if (shouldDeadLetter) {
      logger.error(
        `Notification ${job.id} dead-lettered after ${attempt} attempts: ${message}`,
      );
    } else {
      const delaySec = Math.round((nextSchedule.getTime() - Date.now()) / 1000);
      logger.warn(
        `[request_id=${cycleRequestId}] Notification ${job.id} attempt ${attempt} failed: ${message}. Retrying in ${delaySec}s`,
      );
    }
  }
}

async function deliver(
  job: NotificationOutbox,
  payload: ReservationNotificationPayload,
) {
  if (!job.guestContact) {
    throw new Error('Guest contact is missing');
  }

  const variables = buildTemplateVariables(payload);
  const body = await renderer.render(payload.language ?? 'en', payload.event, {
    ...variables,
  });

  if (payload.channel === 'email') {
    const subject = resolveSubject(payload.event, payload);
    await emailProvider.send({
      to: job.guestContact,
      subject,
      text: body,
    });
    return;
  }

  if (payload.channel === 'sms') {
    await smsProvider.send({
      to: job.guestContact,
      text: body,
    });
    return;
  }

  throw new Error(`Unsupported notification channel: ${payload.channel}`);
}

function parsePayload(job: NotificationOutbox): ReservationNotificationPayload {
  const payload = job.payload as ReservationNotificationPayload | null;
  if (!payload) {
    throw new Error('Missing notification payload');
  }
  if (!payload.event) {
    throw new Error('Notification payload is missing event');
  }
  if (!payload.channel) {
    throw new Error('Notification payload is missing channel');
  }
  if (!payload.reservationId) {
    throw new Error('Notification payload is missing reservationId');
  }
  return payload;
}

function buildTemplateVariables(payload: ReservationNotificationPayload) {
  return {
    guestName: payload.guestName ?? 'guest',
    venueName: payload.venueName ?? 'our venue',
    date: payload.slotLocalDate,
    time: payload.slotLocalTime,
    reservationCode: payload.reservationCode,
    partySize: payload.partySize,
    status: payload.reservationStatus,
  };
}

function resolveSubject(
  event: ReservationNotificationEvent,
  payload: ReservationNotificationPayload,
) {
  const venue = payload.venueName ?? 'Your reservation';
  switch (event) {
    case 'created':
      return `${venue}: reservation received`;
    case 'confirmed':
      return `${venue}: reservation confirmed (${payload.reservationCode})`;
    case 'modified':
      return `${venue}: reservation updated`;
    case 'cancelled':
      return `${venue}: reservation cancelled`;
    case 'reminder':
      return `${venue}: upcoming reservation reminder`;
    default:
      return `${venue}: reservation update`;
  }
}

function isNotificationsEnabled() {
  const flag = process.env.NOTIFICATIONS_ENABLED;
  if (!flag) return false;
  const normalized = flag.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function resolveNumber(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function computeNextSchedule(attempt: number) {
  const backoffMinutes = Math.min(30, 2 ** (attempt - 1));
  const millis = backoffMinutes * 60_000;
  return new Date(Date.now() + millis);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function registerSignalHandlers() {
  const shutdown = async (signal: string) => {
    if (!running) return;
    running = false;
    logger.log(
      `[request_id=${generateRequestId()}] Received ${signal}; shutting down notifications worker...`,
    );
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

registerSignalHandlers();

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(
    `[request_id=${generateRequestId()}] Notifications worker crashed: ${message}`,
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});

function generateRequestId(): string {
  const req = { headers: {} } as Request;
  return ensureRequestId(req);
}

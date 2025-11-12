import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { NotificationOutboxStatus } from '@prisma/client';
import type { PrismaService } from '../prisma.service';

type HttpDurationLabels = {
  method: string;
  route: string;
  statusCode: number;
};

type NotificationAttemptSnapshot = {
  type: string;
  status: string;
  attempts: number;
};

type NotificationLatencySample = {
  type: string;
  latencyMs: number;
};

type NotificationMetricsSnapshot = {
  totalEnqueued: number;
  totalSent: number;
  totalFailed: number;
  attempts: NotificationAttemptSnapshot[];
  sentLast15m: number;
  failedLast15m: number;
  latencies: NotificationLatencySample[];
};

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();
  private readonly httpRequestDuration: Histogram<
    'method' | 'route' | 'status_code'
  >;
  private readonly notificationsEnqueued: Gauge;
  private readonly notificationsSent: Gauge;
  private readonly notificationsFailed: Gauge;
  private readonly notificationsAttempts: Gauge<'type' | 'status'>;
  private readonly notificationsRecent: Gauge<'window' | 'status'>;
  private readonly notificationsDeliveryLatency: Histogram<'type'>;
  private readonly cacheHits: Counter;
  private readonly cacheMisses: Counter;
  private readonly idempotencyHits: Counter;
  private readonly idempotencyConflicts: Counter;
  private readonly rateLimitAllows: Counter<'keyId' | 'route'>;
  private readonly rateLimitDrops: Counter<'keyId' | 'route'>;
  private readonly availabilityPolicyEval: Counter<'venueId'>;
  private readonly commsSent: Counter<'kind'>;
  private readonly commsFailed: Counter<'kind'>;

  constructor() {
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.notificationsEnqueued = new Gauge({
      name: 'notifications_enqueued_total',
      help: 'Total notifications queued for delivery',
      registers: [this.registry],
    });

    this.notificationsSent = new Gauge({
      name: 'notifications_sent_total',
      help: 'Total notifications delivered successfully',
      registers: [this.registry],
    });

    this.notificationsFailed = new Gauge({
      name: 'notifications_failed_total',
      help: 'Total notifications marked as failed',
      registers: [this.registry],
    });

    this.notificationsAttempts = new Gauge({
      name: 'notifications_attempts_total',
      help: 'Aggregated delivery attempts grouped by notification type and final status',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });

    this.notificationsRecent = new Gauge({
      name: 'notifications_recent_total',
      help: 'Notifications processed within a recent time window',
      labelNames: ['status', 'window'],
      registers: [this.registry],
    });

    this.notificationsDeliveryLatency = new Histogram({
      name: 'notifications_delivery_latency_ms',
      help: 'Delivery latency for notifications in milliseconds',
      labelNames: ['type'],
      buckets: [50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000],
      registers: [this.registry],
    });

    this.cacheHits = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits recorded by the API',
      registers: [this.registry],
    });

    this.cacheMisses = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses recorded by the API',
      registers: [this.registry],
    });

    this.idempotencyHits = new Counter({
      name: 'idempotency_hits_total',
      help: 'Number of requests served from stored idempotency responses',
      registers: [this.registry],
    });

    this.idempotencyConflicts = new Counter({
      name: 'idempotency_conflicts_total',
      help: 'Number of idempotency key conflicts due to payload mismatches',
      registers: [this.registry],
    });

    this.availabilityPolicyEval = new Counter({
      name: 'availability_policy_eval_total',
      help: 'Number of availability policy evaluations performed',
      labelNames: ['venueId'],
      registers: [this.registry],
    });

    this.rateLimitAllows = new Counter({
      name: 'ratelimit_allows_total',
      help: 'Requests allowed by the API key rate limiter',
      labelNames: ['keyId', 'route'],
      registers: [this.registry],
    });

    this.rateLimitDrops = new Counter({
      name: 'ratelimit_drops_total',
      help: 'Requests rejected by the API key rate limiter',
      labelNames: ['keyId', 'route'],
      registers: [this.registry],
    });

    this.commsSent = new Counter({
      name: 'comms_sent_total',
      help: 'Total number of communications sent successfully',
      labelNames: ['kind'],
      registers: [this.registry],
    });

    this.commsFailed = new Counter({
      name: 'comms_failed_total',
      help: 'Total number of communications that failed to send',
      labelNames: ['kind'],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  observeHttpRequest(labels: HttpDurationLabels, durationSeconds: number) {
    const sanitizedRoute = labels.route.startsWith('/')
      ? labels.route
      : `/${labels.route}`;

    this.httpRequestDuration.observe(
      {
        method: labels.method.toUpperCase(),
        route: sanitizedRoute,
        status_code: labels.statusCode.toString(),
      },
      durationSeconds,
    );
  }

  async updateNotificationMetrics(prisma: PrismaService) {
    const snapshot = await this.buildNotificationSnapshot(prisma);
    this.applyNotificationSnapshot(snapshot);
  }

  private async buildNotificationSnapshot(
    prisma: PrismaService,
  ): Promise<NotificationMetricsSnapshot> {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60_000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

    const [
      totalEnqueued,
      totalSent,
      totalFailed,
      attempts,
      sentLast15m,
      failedLast15m,
      latencyRows,
    ] = await prisma.$transaction([
      prisma.notificationOutbox.count(),
      prisma.notificationOutbox.count({
        where: { status: NotificationOutboxStatus.SENT },
      }),
      prisma.notificationOutbox.count({
        where: { status: NotificationOutboxStatus.FAILED },
      }),
      prisma.notificationOutbox.groupBy({
        by: ['type', 'status'],
        orderBy: [{ type: 'asc' }, { status: 'asc' }],
        _sum: { attempts: true },
      }),
      prisma.notificationOutbox.count({
        where: {
          status: NotificationOutboxStatus.SENT,
          updatedAt: { gte: fifteenMinutesAgo },
        },
      }),
      prisma.notificationOutbox.count({
        where: {
          status: NotificationOutboxStatus.FAILED,
          updatedAt: { gte: fifteenMinutesAgo },
        },
      }),
      prisma.notificationOutbox.findMany({
        where: {
          status: NotificationOutboxStatus.SENT,
          updatedAt: { gte: oneDayAgo },
        },
        select: {
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const attemptSamples = attempts.map<NotificationAttemptSnapshot>(
      (item) => ({
        type: sanitizeType(item.type),
        status: item.status,
        attempts: item._sum?.attempts ?? 0,
      }),
    );

    const latencySamples = latencyRows
      .map<NotificationLatencySample | null>((row) => {
        const latency = row.updatedAt.getTime() - row.createdAt.getTime();
        if (!Number.isFinite(latency) || latency < 0) return null;
        return {
          type: sanitizeType(row.type),
          latencyMs: latency,
        };
      })
      .filter((value): value is NotificationLatencySample => value !== null);

    return {
      totalEnqueued,
      totalSent,
      totalFailed,
      attempts: attemptSamples,
      sentLast15m,
      failedLast15m,
      latencies: latencySamples,
    };
  }

  private applyNotificationSnapshot(snapshot: NotificationMetricsSnapshot) {
    this.notificationsEnqueued.set(snapshot.totalEnqueued);
    this.notificationsSent.set(snapshot.totalSent);
    this.notificationsFailed.set(snapshot.totalFailed);

    this.notificationsAttempts.reset();
    for (const item of snapshot.attempts) {
      this.notificationsAttempts.set(
        {
          type: item.type,
          status: item.status.toLowerCase(),
        },
        item.attempts,
      );
    }

    this.notificationsRecent.reset();
    this.notificationsRecent.set(
      { status: 'sent', window: '15m' },
      snapshot.sentLast15m,
    );
    this.notificationsRecent.set(
      { status: 'failed', window: '15m' },
      snapshot.failedLast15m,
    );

    this.notificationsDeliveryLatency.reset();
    for (const latency of snapshot.latencies) {
      this.notificationsDeliveryLatency.observe(
        { type: latency.type },
        latency.latencyMs,
      );
    }
  }

  incrementCacheHit() {
    this.cacheHits.inc();
  }

  incrementCacheMiss() {
    this.cacheMisses.inc();
  }

  incrementIdempotencyHit() {
    this.idempotencyHits.inc();
  }

  incrementIdempotencyConflict() {
    this.idempotencyConflicts.inc();
  }

  incrementRateLimitAllow(keyId: string, route: string) {
    this.rateLimitAllows.inc({
      keyId,
      route,
    });
  }

  incrementRateLimitDrop(keyId: string, route: string) {
    this.rateLimitDrops.inc({
      keyId,
      route,
    });
  }

  incrementAvailabilityPolicyEval(venueId: string) {
    this.availabilityPolicyEval.inc({ venueId });
  }

  incrementCommsSent(kind: string) {
    this.commsSent.inc({ kind: sanitizeType(kind) });
  }

  incrementCommsFailed(kind: string) {
    this.commsFailed.inc({ kind: sanitizeType(kind) });
  }
}

function sanitizeType(value: string | null | undefined): string {
  if (!value || value.trim().length === 0) {
    return 'unknown';
  }
  return value.trim().toLowerCase();
}

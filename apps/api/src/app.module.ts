// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { Request, Response } from 'express';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AuthModule } from './auth/auth.module';
import { ensureRequestId } from './common/middleware/request-id.middleware';
import { HoldsCleanupService } from './holds.cleanup.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';
import { MetricsModule } from './metrics/metrics.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { SeatingService } from './seating.service';
import { VenuesModule } from './venues/venues.module';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsAdminService } from './notifications/notifications.admin.service';
import { WebhooksService } from './webhooks/webhooks.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WebhooksAdminService } from './webhooks/webhooks.admin.service';
import { CacheModule } from './cache/cache.module';
import { DatabaseModule } from './database/database.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { ApiKeysController } from './admin/api-keys.controller';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { PrivacyController } from './privacy/privacy.controller';
import { PrivacyService } from './privacy/privacy.service';
import { AuditController } from './audit/audit.controller';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req, res) =>
          ensureRequestId(
            req as Request,
            (res as Response | undefined) ?? undefined,
          ),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'HH:MM:ss.l',
                  colorize: true,
                },
              },
        autoLogging: {
          ignore: (req) => req.url === '/health' || req.url === '/metrics',
        },
        customSuccessMessage: (_req, res) =>
          `completed ${res.statusCode} response`,
        customErrorMessage: (_req, res) =>
          `failed with ${res.statusCode} response`,
        customProps: (req, res) => {
          const request = req as Request | undefined;
          const response = res as (Response & { responseTime?: number }) | undefined;
          const requestId = request
            ? request.requestId ?? ensureRequestId(request, response)
            : undefined;
          const rawDurationMs =
            request && typeof request.responseDurationMs === 'number'
              ? request.responseDurationMs
              : response && typeof response?.responseTime === 'number'
              ? response.responseTime
              : undefined;
          const durationMs =
            rawDurationMs !== undefined
              ? Math.max(Math.round(rawDurationMs), 0)
              : undefined;
          return {
            ...(requestId ? { request_id: requestId } : {}),
            ...(request
              ? {
                  method: request.method,
                  path: request.originalUrl ?? request.url,
                }
              : {}),
            ...(response
              ? {
                  status: response.statusCode,
                  ...(durationMs !== undefined
                    ? { duration_ms: durationMs }
                    : {}),
                }
              : {}),
          };
        },
      },
    }),
    MetricsModule,
    CacheModule,
    DatabaseModule,
    RateLimitModule,
    IdempotencyModule,
    VenuesModule,
    AuthModule,
  ],
  controllers: [
    AppController,
    ReservationsController,
    HoldsController,
    AvailabilityController,
    NotificationsController,
    WebhooksController,
    ApiKeysController,
    PrivacyController,
    AuditController,
  ],
  providers: [
    AppService,
    ReservationsService,
    SeatingService,
    HoldsService,
    AvailabilityService,
    NotificationsService,
    NotificationsAdminService,
    WebhooksService,
    WebhooksAdminService,
    HoldsCleanupService,
    PrivacyService,
  ],
})
export class AppModule {}




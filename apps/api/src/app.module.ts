import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Request, Response } from 'express';
import { LoggerModule } from 'nestjs-pino';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { ApiKeysController } from './admin/api-keys.controller';
import { AdminBlackoutsController } from './admin/blackouts.controller';
import { AdminPacingRulesController } from './admin/pacing-rules.controller';
import { AdminServiceBuffersController } from './admin/service-buffers.controller';
import { AdminShiftsController } from './admin/shifts.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditController } from './audit/audit.controller';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { CommsModule } from './comms/comms.module';
import { DatabaseModule } from './database/database.module';
import { HoldsModule } from './holds.module';
import { HoldsCleanupService } from './holds.cleanup.service';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsAdminService } from './notifications/notifications.admin.service';
import { NotificationsService } from './notifications/notifications.service';
import { PrivacyController } from './privacy/privacy.controller';
import { PrivacyService } from './privacy/privacy.service';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { SeatingService } from './seating.service';
import { VenuesModule } from './venues/venues.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { requestContextMiddleware } from './common/request-context';
import { ensureRequestId } from './common/middleware/request-id.middleware';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { WebhooksAdminService } from './webhooks/webhooks.admin.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WebhooksService } from './webhooks/webhooks.service';

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
    CommsModule,
    HoldsModule,
    WaitlistModule,
  ],
  controllers: [
    AppController,
    ReservationsController,
    AvailabilityController,
    NotificationsController,
    WebhooksController,
    ApiKeysController,
    AdminShiftsController,
    AdminPacingRulesController,
    AdminBlackoutsController,
    AdminServiceBuffersController,
    PrivacyController,
    AuditController,
  ],
  providers: [
    AppService,
    ReservationsService,
    SeatingService,
    AvailabilityService,
    NotificationsService,
    NotificationsAdminService,
    WebhooksService,
    WebhooksAdminService,
    HoldsCleanupService,
    PrivacyService,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContextMiddleware).forRoutes('*');
  }
}

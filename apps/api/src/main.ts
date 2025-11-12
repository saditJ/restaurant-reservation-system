import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import './bootstrap-env';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  ensureRequestId,
  requestIdMiddleware,
} from './common/middleware/request-id.middleware';
import { MetricsService } from './metrics/metrics.service';
import { createRequestTimingMiddleware } from './metrics/request-timing.middleware';
import { initTelemetry } from './telemetry';

initTelemetry();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const httpServer = app.getHttpAdapter().getInstance();
  if (typeof httpServer?.disable === 'function') {
    httpServer.disable('x-powered-by');
  }
  app.use(requestIdMiddleware);

  const logger = app.get(PinoLogger);
  app.useLogger(logger);

  const metricsService = app.get(MetricsService);
  app.use(createRequestTimingMiddleware(metricsService));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  const isDev = !isProd;
  const allowedOrigins = buildAllowedOrigins();
  const frameAncestors = buildFrameAncestors(isDev);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: buildContentSecurityPolicy(frameAncestors, isDev),
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: isProd
        ? {
            maxAge: 63072000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  if (isDev) {
    app.enableCors({
      origin: true,
      credentials: true,
    });
  } else {
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = normalizeOrigin(origin);
        if (normalized && allowedOrigins.has(normalized)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
      },
      credentials: true,
    });
  }

  setupSwagger(app, logger);

  const port = 3003; // PATCH 20b
  await app.listen(port); // PATCH 20b
  logger.log(`Nest API ready on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Nest API', error);
  process.exitCode = 1;
});

function setupSwagger(app: INestApplication, logger: PinoLogger) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const swaggerPath = (process.env.SWAGGER_PATH ?? 'docs').replace(/^\//, '');
  const allowedKeys = new Set<string>();
  const swaggerKey = process.env.SWAGGER_API_KEY?.trim();
  if (swaggerKey) {
    allowedKeys.add(swaggerKey);
  }
  const devKey = process.env.API_KEY?.trim();
  if (devKey) {
    allowedKeys.add(devKey);
  }
  if (allowedKeys.size === 0) {
    logger.warn(
      'Swagger UI is enabled but no static API key is configured; set SWAGGER_API_KEY or API_KEY to allow access.',
    );
  }

  const authMiddleware = createSwaggerGuard(allowedKeys);
  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.use(`/${swaggerPath}`, authMiddleware);
  httpServer.use(`/${swaggerPath}-json`, authMiddleware);

  const config = new DocumentBuilder()
    .setTitle('Reserve Platform API')
    .setDescription(
      'REST API for reservation management, webhooks, and integrations.',
    )
    .setVersion(process.env.npm_package_version ?? '1.0.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key issued via the console settings',
      },
      'ApiKeyAuth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).filter(([path]) =>
      path.startsWith('/v1/'),
    ),
  );

  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  logger.log(`Swagger UI available at /${swaggerPath} (API key required)`);
}

function buildAllowedOrigins() {
  const defaults = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
  ];
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
  return new Set(
    [...defaults.map(normalizeOrigin), ...extra].filter(
      (value): value is string => Boolean(value),
    ),
  );
}

function buildContentSecurityPolicy(frameAncestors: string[], isDev: boolean) {
  const scriptSrc = ["'self'"];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'", "'unsafe-inline'");
  }

  const connectSrc = ["'self'"];
  if (isDev) {
    connectSrc.push('ws:', 'http://localhost:*', 'https://localhost:*');
  }

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    fontSrc: ["'self'", 'data:'],
    formAction: ["'self'"],
    frameAncestors,
    objectSrc: ["'none'"],
    connectSrc,
    scriptSrc,
  };
}

function buildFrameAncestors(isDev: boolean) {
  const configured = [
    process.env.BOOKING_WIDGET_FRAME_ANCESTORS,
    process.env.MARKET_ORIGIN,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(','));

  const normalized = configured
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));

  const defaults = ["'self'"];
  if (isDev) {
    defaults.push('http://localhost:3000');
  }

  return Array.from(new Set([...defaults, ...normalized]));
}

function normalizeOrigin(value: string) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, '').toLowerCase();
}

function createSwaggerGuard(allowedKeys: Set<string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['x-api-key'];
    const key =
      typeof header === 'string'
        ? header
        : Array.isArray(header)
          ? header[0]
          : undefined;

    if (!key) {
      ensureRequestId(req, res);
      res.setHeader('content-type', 'application/json');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing API key for Swagger UI',
          details: {
            request_id: req.requestId,
            required_header: 'x-api-key',
          },
        },
      });
      return;
    }

    if (!allowedKeys.has(key)) {
      ensureRequestId(req, res);
      res.setHeader('content-type', 'application/json');
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Invalid API key for Swagger UI',
          details: {
            request_id: req.requestId,
            required_header: 'x-api-key',
          },
        },
      });
      return;
    }

    next();
  };
}

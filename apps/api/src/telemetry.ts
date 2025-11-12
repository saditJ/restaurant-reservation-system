import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

let sdk: NodeSDK | null = null;
let initializing = false;

export function initTelemetry() {
  if (sdk || initializing) {
    return;
  }

  const exporterUrl = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '').trim();
  if (!exporterUrl) {
    return;
  }

  initializing = true;
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const resource = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME ?? 'reserve-api',
    [SemanticResourceAttributes.SERVICE_VERSION]:
      process.env.npm_package_version ?? '0.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
      process.env.NODE_ENV ?? 'development',
  });

  const exporter = new OTLPTraceExporter({
    url: exporterUrl,
    headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
  });

  sdk = new NodeSDK({
    traceExporter: exporter,
    resource,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) =>
          Boolean(request.url && request.url.endsWith('/metrics')),
      }),
      new UndiciInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  try {
    sdk.start();
  } catch (error) {
    console.error('Failed to start telemetry', error);
  } finally {
    initializing = false;
  }

  const shutdown = async () => {
    try {
      await sdk?.shutdown();
    } catch (error) {
      console.error('Failed to shutdown telemetry', error);
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

function parseHeaders(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return Object.fromEntries(
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.includes('='))
      .map((pair) => {
        const [key, ...rest] = pair.split('=');
        return [key.trim(), rest.join('=').trim()];
      }),
  );
}

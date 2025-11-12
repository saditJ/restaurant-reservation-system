import { NextRequest, NextResponse } from 'next/server';

const TARGET = process.env.API_BASE_INTERNAL ?? 'http://localhost:3003';

function resolveApiKey(): string | undefined {
  const explicit = process.env.API_KEY?.trim();
  if (explicit) {
    return explicit;
  }

  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (nodeEnv !== 'production') {
    return 'dev-local-key';
  }

  return undefined;
}

const API_KEY = resolveApiKey();

const FORWARD_HEADERS = new Set([
  'content-type',
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent',
]);

async function proxy(req: NextRequest) {
  if (!TARGET || !API_KEY) {
    return NextResponse.json(
      {
        error: {
          code: 'PROXY_MISCONFIGURED',
          message: 'Marketplace API proxy is not configured.',
        },
      },
      { status: 500 },
    );
  }

  const rawPath = req.nextUrl.pathname.replace(/^\/api/, '') || '/';
  const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const needsVersionPrefix = !['/health', '/live', '/ready'].some(
    (publicPath) =>
      normalized === publicPath || normalized.startsWith(`${publicPath}/`),
  );
  const upstreamPath =
    needsVersionPrefix && !normalized.startsWith('/v1/')
      ? `/v1${normalized}`
      : normalized;
  const cleanedPath = upstreamPath.replace(/\/+/g, '/');
  const url = new URL(cleanedPath + (req.nextUrl.search || ''), TARGET);

  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lowered = key.toLowerCase();
    if (FORWARD_HEADERS.has(lowered)) {
      headers.set(key, value);
    }
  }

  const forwardedHost =
    req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (forwardedHost) {
    headers.set('x-forwarded-host', forwardedHost.split(',')[0]);
  }
  const forwardedProto =
    req.headers.get('x-forwarded-proto') ?? req.headers.get('next-url-proto');
  if (forwardedProto) {
    headers.set('x-forwarded-proto', forwardedProto);
  }

  headers.set('x-api-key', API_KEY);
  headers.set('x-client-app', 'market');

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await req.json().catch(() => undefined);
      if (json !== undefined) {
        body = JSON.stringify(json);
        headers.set('content-type', 'application/json');
      }
    } else if (contentType) {
      const arrayBuffer = await req.arrayBuffer();
      body = arrayBuffer;
      headers.set('content-type', contentType);
    }
  }

  const response = await fetch(url, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const outgoingHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'access-control-allow-origin') {
      return;
    }
    outgoingHeaders.set(key, value);
  });

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    status: response.status,
    headers: outgoingHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;

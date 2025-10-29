import { NextRequest, NextResponse } from 'next/server';

const TARGET = process.env.API_BASE_INTERNAL ?? 'http://localhost:3003';

function resolveApiKey(): string | undefined {
  const direct = process.env.API_KEY?.trim();
  if (direct) return direct;
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (nodeEnv !== 'production') {
    return 'dev-local-key';
  }
  return undefined;
}

const API_KEY = resolveApiKey();

// Minimal list of headers that are safe to forward to the API
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
      { error: { code: 'PROXY_MISCONFIG', message: 'API proxy not configured' } },
      { status: 500 },
    );
  }

  // Map /api/... from Next to the upstream TARGET URL, prefixing versioned routes with /v1
  const rawPath = req.nextUrl.pathname.replace(/^\/api/, '') || '/';
  const normalizedRawPath =
    rawPath === '/' ? '/' : rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const needsVersionPrefix = !['/health', '/live', '/ready'].some(
    (allowed) =>
      normalizedRawPath === allowed ||
      normalizedRawPath.startsWith(`${allowed}/`),
  );
  const shouldPrefix =
    needsVersionPrefix && !normalizedRawPath.startsWith('/v1/');
  const upstreamPath = shouldPrefix
    ? `/v1${normalizedRawPath}`
    : normalizedRawPath;
  const normalizedPath = upstreamPath.replace(/\/+/g, '/');
  const url = new URL(normalizedPath + (req.nextUrl.search || ''), TARGET);

  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (FORWARD_HEADERS.has(lower)) {
      headers.set(key, value);
    }
  }
  headers.set('x-api-key', API_KEY);
  headers.set('x-client-app', 'booking-widget');

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await req.json().catch(() => undefined);
      if (json !== undefined) {
        body = JSON.stringify(json);
        headers.set('content-type', 'application/json');
      }
    } else {
      const arrayBuffer = await req.arrayBuffer();
      body = arrayBuffer;
    }
  }

  const response = await fetch(url, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const outHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'access-control-allow-origin') return;
    outHeaders.set(key, value);
  });

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    status: response.status,
    headers: outHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;

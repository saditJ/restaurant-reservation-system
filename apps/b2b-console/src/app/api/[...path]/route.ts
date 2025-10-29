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

async function proxy(req: NextRequest) {
  if (!TARGET || !API_KEY) {
    return NextResponse.json(
      { error: { code: 'PROXY_MISCONFIG', message: 'API proxy not configured' } },
      { status: 500 },
    );
  }

  // Build target URL by mapping /api/... onto TARGET, prefixing unversioned routes with /v1
  const rawPath = req.nextUrl.pathname.replace(/^\/api/, '') || '/';
  const normalizedRawPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const isSpecialRoute = ['/health', '/live', '/ready'].some(
    (allowed) =>
      normalizedRawPath === allowed || normalizedRawPath.startsWith(`${allowed}/`),
  );
  const hasVersionPrefix =
    normalizedRawPath === '/v1' || normalizedRawPath.startsWith('/v1/');
  const upstreamPath =
    !isSpecialRoute && !hasVersionPrefix ? `/v1${normalizedRawPath}` : normalizedRawPath;
  const normalizedPath = upstreamPath.replace(/\/+/g, '/');
  const url = new URL(normalizedPath + (req.nextUrl.search || ''), TARGET);

  // Compose headers: forward a few, add x-api-key
  const headers = new Headers();
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length',
  ]);
  req.headers.forEach((value, key) => {
    if (!hopByHop.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.set('x-api-key', API_KEY);
  headers.set('x-client-app', 'b2b-console');

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.toLowerCase().includes('application/json')) {
      const json = await req.json().catch(() => undefined);
      if (json !== undefined) {
        body = JSON.stringify(json);
        headers.set('content-type', 'application/json');
      }
    } else {
      const arrayBuffer = await req.arrayBuffer();
      body = arrayBuffer.byteLength ? arrayBuffer : undefined;
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

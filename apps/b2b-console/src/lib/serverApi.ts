import { ApiError } from './api';

const SPECIAL_PREFIXES = ['/health', '/live', '/ready', '/metrics'];

function getBaseUrl(): string {
  const raw = process.env.API_BASE_INTERNAL ?? 'http://localhost:3003';
  return raw.replace(/\/+$/, '');
}

function resolvePath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const isSpecial = SPECIAL_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
  if (normalized.startsWith('/v1/') || isSpecial) {
    return normalized;
  }
  return `/v1${normalized}`;
}

function getApiKey(): string {
  const direct = process.env.API_KEY?.trim();
  if (direct) return direct;
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (nodeEnv !== 'production') {
    return 'dev-local-key';
  }
  throw new Error('API_KEY env variable must be set for server API access');
}

async function parseBody(response: Response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function toApiError(response: Response, payload: unknown) {
  const envelope =
    payload && typeof payload === 'object' && payload !== null && 'error' in payload
      ? (payload as { error?: { message?: unknown; code?: unknown; details?: unknown } }).error
      : undefined;
  const message =
    (typeof envelope?.message === 'string' && envelope.message.trim().length > 0
      ? envelope.message
      : typeof payload === 'string' && payload
      ? payload
      : response.statusText) || 'Request failed';
  return new ApiError({
    message,
    status: response.status,
    code: typeof envelope?.code === 'string' ? envelope.code : undefined,
    details: envelope?.details,
    payload,
  });
}

async function request<T>(path: string, init: RequestInit = {}) {
  const url = `${getBaseUrl()}${resolvePath(path)}`;
  const headers = new Headers(init.headers ?? {});
  headers.set('accept', 'application/json');
  if (!headers.has('x-api-key')) {
    headers.set('x-api-key', getApiKey());
  }
  headers.set('x-client-app', 'b2b-console');
  const finalInit: RequestInit = {
    ...init,
    headers,
    cache: 'no-store',
  };
  const response = await fetch(url, finalInit);
  const payload = await parseBody(response);
  if (!response.ok) {
    throw toApiError(response, payload);
  }
  return payload as T;
}

function withJsonBody(body: unknown, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers ?? {});
  headers.set('accept', 'application/json');
  headers.set('content-type', 'application/json');
  return {
    ...init,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export async function serverGet<T>(path: string, init?: RequestInit) {
  return request<T>(path, { ...(init ?? {}), method: 'GET' });
}

export async function serverPost<T>(path: string, body?: unknown, init?: RequestInit) {
  return request<T>(path, { ...withJsonBody(body, init), method: 'POST' });
}

export async function serverPatch<T>(path: string, body?: unknown, init?: RequestInit) {
  return request<T>(path, { ...withJsonBody(body, init), method: 'PATCH' });
}

export async function serverPut<T>(path: string, body?: unknown, init?: RequestInit) {
  return request<T>(path, { ...withJsonBody(body, init), method: 'PUT' });
}

export async function serverDelete<T>(path: string, init?: RequestInit) {
  return request<T>(path, { ...(init ?? {}), method: 'DELETE' });
}

const API_PREFIX = '/api';
const DEFAULT_DEV_ORIGIN = `http://localhost:${process.env.PORT ?? '3001'}`;

type ErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  payload?: unknown;

  constructor(init: { message: string; status: number; code?: string; details?: unknown; payload?: unknown }) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.payload = init.payload;
  }
}

const SPECIAL_PREFIXES = ['/health', '/live', '/ready', '/metrics'];

function normalizePath(path: string) {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

function withVersionPrefix(path: string) {
  if (path.startsWith('/v1/')) return path;
  if (SPECIAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return path;
  }
  return `/v1${path}`;
}

function resolve(path: string) {
  const normalized = normalizePath(path);
  const withVersion = withVersionPrefix(normalized);
  return `${API_PREFIX}${withVersion}`;
}

function resolveFetchUrl(path: string) {
  const relative = resolve(path);
  if (typeof window !== 'undefined') {
    return relative;
  }
  const base =
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
    DEFAULT_DEV_ORIGIN;
  return new URL(relative, base).toString();
}

function mergeHeaders(headers?: HeadersInit) {
  const next = new Headers(headers ?? {});
  if (!next.has('accept')) {
    next.set('accept', 'application/json');
  }
  return next;
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

function asErrorEnvelope(payload: unknown): ErrorEnvelope['error'] | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const envelope = payload as ErrorEnvelope;
  if (!('error' in envelope)) return undefined;
  if (typeof envelope.error !== 'object' || envelope.error === null) return undefined;
  return envelope.error;
}

function toApiError(response: Response, payload: unknown) {
  const error = asErrorEnvelope(payload);
  const message =
    error && typeof error.message === 'string' && error.message.trim().length > 0
      ? error.message
      : response.statusText || 'Request failed';
  return new ApiError({
    message,
    status: response.status,
    code: error && typeof error.code === 'string' ? error.code : undefined,
    details: error?.details,
    payload,
  });
}

async function request<T>(path: string, init: RequestInit) {
  const target = resolveFetchUrl(path);
  const finalInit: RequestInit = {
    cache: 'no-store',
    ...init,
  };
  finalInit.headers = mergeHeaders(init.headers);
  const response = await fetch(target, finalInit);
  const payload = await parseBody(response);
  if (!response.ok) {
    throw toApiError(response, payload);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return payload as T;
}

function withJsonBody(body: unknown, init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});
  if (body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return {
    ...init,
    headers,
    body: body === undefined ? init?.body : JSON.stringify(body),
  };
}

export async function GET<T>(path: string, init?: RequestInit) {
  return request<T>(path, { ...(init ?? {}), method: 'GET' });
}

export async function POST<T>(path: string, body?: unknown, init?: RequestInit) {
  return request<T>(path, {
    ...withJsonBody(body, init),
    method: 'POST',
  });
}

export async function PATCH<T>(path: string, body?: unknown, init?: RequestInit) {
  return request<T>(path, {
    ...withJsonBody(body, init),
    method: 'PATCH',
  });
}

export async function PUT<T>(path: string, body?: unknown, init?: RequestInit) {
  return request<T>(path, {
    ...withJsonBody(body, init),
    method: 'PUT',
  });
}

export async function DELETE<T>(path: string, body?: unknown, init?: RequestInit) {
  return request<T>(path, {
    ...withJsonBody(body, init),
    method: 'DELETE',
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function formatApiError(error: unknown) {
  if (!isApiError(error)) {
    return { message: 'Unexpected error', code: undefined, status: undefined };
  }
  return {
    message: error.message,
    code: error.code,
    status: error.status,
    details: error.details,
  };
}

export async function fetchSeatingSuggestions(reservationId: string, limit?: number) {
  const body =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? { limit } : undefined;
  return POST<import('./types').SeatingSuggestionsResponse>(
    `/v1/reservations/${reservationId}/suggestions`,
    body,
  );
}

export async function assignReservationTables(reservationId: string, tableIds: string[]) {
  return POST<import('./types').Reservation>(`/v1/reservations/${reservationId}/assign`, {
    tableIds,
  });
}

export const apiGet = GET;

export function apiJSON<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
) {
  switch (method) {
    case 'POST':
      return POST<T>(path, body);
    case 'PATCH':
      return PATCH<T>(path, body);
    case 'PUT':
      return PUT<T>(path, body);
    case 'DELETE':
      return DELETE<T>(path, body);
    default:
      throw new Error(`Unsupported method ${method}`);
  }
}

export async function listWaitlist(params: {
  venueId?: string;
  status?: string;
  limit?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.venueId) search.set('venueId', params.venueId);
  if (params.status) search.set('status', params.status);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const path = query ? `/waitlist?${query}` : '/waitlist';
  return GET<import('./types').WaitlistListResponse>(path, { cache: 'no-store' });
}

export async function listRecentOffers(limit = 20) {
  const search = new URLSearchParams();
  if (limit) {
    search.set('limit', String(limit));
  }
  const query = search.toString();
  const path = query ? `/waitlist/offers/recent?${query}` : '/waitlist/offers/recent';
  return GET<import('./types').WaitlistOfferSummary[]>(path, { cache: 'no-store' });
}

export async function offerWaitlist(
  id: string,
  body: { slotStart: string; ttlMinutes?: number },
) {
  return POST<import('./types').WaitlistEntry>(`/waitlist/${encodeURIComponent(id)}/offer`, body);
}

export async function expireWaitlist(id: string) {
  return POST<import('./types').WaitlistEntry>(
    `/waitlist/${encodeURIComponent(id)}/expire`,
  );
}

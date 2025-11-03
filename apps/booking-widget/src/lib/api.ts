const DEFAULT_VENUE_ID = 'venue-main';

const BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '/api').trim() || '/api';
export const VENUE_ID =
  process.env.NEXT_PUBLIC_VENUE_ID?.trim() || DEFAULT_VENUE_ID;

import type {
  AvailabilityResponse,
  Hold,
  Reservation,
  ReservationListResponse,
  ReservationStatus,
  VenuePolicies,
} from '@/lib/types';

type QueryValue = string | number | boolean;

type ApiErrorOptions = {
  status: number;
  code?: string;
  details?: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

function resolveBase(path: string) {
  if (BASE.startsWith('http://') || BASE.startsWith('https://')) {
    return new URL(path, BASE).toString();
  }
  if (path.startsWith('/')) return `${BASE}${path}`;
  return `${BASE}/${path}`;
}

function toSearchParams(
  params: Record<string, QueryValue | null | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, String(value));
  }
  return search;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

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

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  const response = await fetch(resolveBase(path), {
    ...init,
    headers,
  });
  const payload = await parseBody(response);

  if (!response.ok) {
    const envelope =
      payload && typeof payload === 'object' ? (payload as Record<string, any>) : null;
    const errorInfo =
      envelope && typeof envelope.error === 'object' ? (envelope.error as Record<string, any>) : null;
    const message =
      (errorInfo && typeof errorInfo.message === 'string'
        ? errorInfo.message
        : typeof payload === 'string' && payload
        ? payload
        : response.statusText) || 'Request failed';
    throw new ApiError(message, {
      status: response.status,
      code:
        errorInfo && typeof errorInfo.code === 'string'
          ? errorInfo.code
          : undefined,
      details: errorInfo?.details ?? envelope ?? payload ?? null,
    });
  }

  return payload as T;
}

function withJsonInit(body: unknown, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers ?? {});
  headers.set('content-type', 'application/json');
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }
  return {
    ...init,
    headers,
    body: JSON.stringify(body),
  };
}

export async function checkHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/health', { cache: 'no-store' });
}

export async function fetchAvailability(params: {
  date: string;
  time: string;
  partySize: number;
  tableId?: string | null;
  venueId?: string;
}): Promise<AvailabilityResponse> {
  const search = toSearchParams({
    venueId: params.venueId ?? VENUE_ID,
    date: params.date,
    time: params.time,
    partySize: params.partySize,
    tableId: params.tableId ?? undefined,
  });
  return apiFetch<AvailabilityResponse>(`/availability?${search.toString()}`, {
    cache: 'no-store',
  });
}

export async function createHold(body: {
  date: string;
  time: string;
  partySize: number;
  tableId: string | null;
  venueId?: string;
  createdBy?: string;
}): Promise<Hold> {
  const payload = {
    venueId: body.venueId ?? VENUE_ID,
    date: body.date,
    time: body.time,
    partySize: body.partySize,
    tableId: body.tableId,
    createdBy: body.createdBy ?? 'guest-widget',
  };
  return apiFetch<Hold>('/holds', withJsonInit(payload, { method: 'POST' }));
}

export async function createReservation(
  body: {
  holdId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail?: string | null;
  notes?: string | null;
  venueId?: string;
  channel?: string;
  createdBy?: string;
},
  options?: { idempotencyKey?: string },
): Promise<Reservation> {
  const payload = {
    venueId: body.venueId ?? VENUE_ID,
    holdId: body.holdId,
    guest: {
      name: body.guestName,
      ...(body.guestPhone ? { phone: body.guestPhone } : {}),
      ...(body.guestEmail ? { email: body.guestEmail } : {}),
    },
    notes: body.notes ?? undefined,
    channel: body.channel ?? 'guest-web',
    createdBy: body.createdBy ?? 'guest-widget',
  };
  const headers =
    options?.idempotencyKey !== undefined
      ? { 'Idempotency-Key': options.idempotencyKey }
      : undefined;
  return apiFetch<Reservation>(
    '/reservations',
    withJsonInit(payload, {
      method: 'POST',
      headers,
    }),
  );
}

export async function convertWaitlistOffer(code: string, token: string): Promise<void> {
  await apiFetch<unknown>(
    `/waitlist/offer/${encodeURIComponent(code)}/convert`,
    withJsonInit({ token }, { method: 'POST' }),
  );
}

export async function listReservations(
  query: Record<string, QueryValue | null | undefined>,
): Promise<ReservationListResponse> {
  const search = toSearchParams(query);
  if (!search.has('venueId')) {
    search.set('venueId', VENUE_ID);
  }
  return apiFetch<ReservationListResponse>(
    `/reservations?${search.toString()}`,
    { cache: 'no-store' },
  );
}

export async function updateReservation(
  id: string,
  body: {
    guestName?: string;
    guestPhone?: string | null;
    guestEmail?: string | null;
    notes?: string | null;
  },
): Promise<Reservation> {
  const payload = {
    ...body,
  };
  return apiFetch<Reservation>(
    `/reservations/${encodeURIComponent(id)}`,
    withJsonInit(payload, { method: 'PATCH' }),
  );
}

export async function updateReservationStatus(
  id: string,
  status: ReservationStatus,
): Promise<Reservation> {
  return apiFetch<Reservation>(
    `/reservations/${encodeURIComponent(id)}/status`,
    withJsonInit({ status }, { method: 'PATCH' }),
  );
}

export async function getVenuePolicies(
  venueId: string = VENUE_ID,
): Promise<VenuePolicies> {
  return apiFetch<VenuePolicies>(
    `/venues/${encodeURIComponent(venueId)}/policies`,
    { cache: 'no-store' },
  );
}

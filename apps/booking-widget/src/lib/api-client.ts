/**
 * Simple API client for booking widget
 * Uses NEXT_PUBLIC_API_BASE (default: http://localhost:3003)
 * Handles rate limiting (429) and idempotency
 */

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3003'
).trim();

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'front-desk-1';

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Generate idempotency key for POST requests
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-Client-App': 'booking-widget',
    ...((options.headers as Record<string, string>) || {}),
  };

  // Add idempotency key for POST requests
  if (options.method === 'POST' && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = generateIdempotencyKey();
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let errorCode = 'UNKNOWN_ERROR';
    let details: unknown = undefined;

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
      errorCode = errorData.code || errorData.error || errorCode;
      details = errorData;
    } catch {
      // Couldn't parse error JSON
    }

    throw new ApiError(response.status, errorCode, errorMessage, details);
  }

  return response.json();
}

/**
 * GET /v1/availability
 */
export async function getAvailability(params: {
  venueId: string;
  date: string;
  time: string;
  partySize: number;
}) {
  const searchParams = new URLSearchParams({
    venueId: params.venueId,
    date: params.date,
    time: params.time,
    partySize: params.partySize.toString(),
  });

  return apiFetch<{
    requested: {
      venueId: string;
      date: string;
      time: string;
      partySize: number;
      durationMinutes: number;
    };
    tables: Array<{
      id: string;
      label: string;
      capacity: number;
      area?: string | null;
    }>;
    stats: {
      total: number;
      available: number;
      blocked: number;
    };
  }>(`/v1/availability?${searchParams}`);
}

/**
 * POST /v1/holds
 */
export async function createHold(data: {
  venueId: string;
  date: string;
  time: string;
  partySize: number;
  tableId: string;
  createdBy: string;
}) {
  return apiFetch<{
    id: string;
    status: string;
    tableId: string;
    slotLocalDate: string;
    slotLocalTime: string;
    expiresAt: string;
  }>('/v1/holds', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * POST /v1/reservations
 */
export async function createReservation(data: {
  venueId: string;
  holdId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  notes?: string;
}) {
  return apiFetch<{
    id: string;
    code: string;
    status: string;
    guestName: string;
    partySize: number;
    slotLocalDate: string;
    slotLocalTime: string;
    tableLabel: string | null;
  }>('/v1/reservations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * GET /v1/reservations/by-token/:token
 */
export async function getReservationByToken(token: string) {
  return apiFetch<{
    id: string;
    code: string;
    venueId: string;
    status: string;
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
    partySize: number;
    slotLocalDate: string;
    slotLocalTime: string;
    tableLabel: string | null;
    notes: string | null;
  }>(`/v1/reservations/by-token/${token}`);
}

export { ApiError };

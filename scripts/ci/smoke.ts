import { randomUUID } from 'node:crypto';

type AvailabilityResponse = {
  requested: {
    venueId: string;
    date: string;
    time: string;
    partySize: number;
  };
  tables: Array<{
    id: string;
    label: string | null;
    capacity: number;
  }>;
  stats: {
    total: number;
    available: number;
    blocked: number;
  };
};

type HoldResponse = {
  id: string;
  venueId: string;
  status: string;
  booking: {
    date: string;
    time: string;
    partySize: number;
    tableId: string | null;
  };
};

type ReservationResponse = {
  id: string;
  venueId: string;
  status: string;
  slotLocalDate: string;
  slotLocalTime: string;
  partySize: number;
  hold?: {
    id: string;
    status: string;
  } | null;
};

const BASE_URL = process.env.CI_API_BASE ?? 'http://127.0.0.1:3003';
const API_KEY = process.env.API_KEY ?? process.env.CI_API_KEY ?? '';
const VENUE_ID = process.env.SMOKE_VENUE_ID ?? 'venue-brooklyn';
const HOLD_DATE = process.env.SMOKE_HOLD_DATE ?? '2025-12-24';
const HOLD_TIME = process.env.SMOKE_HOLD_TIME ?? '19:00';
const RES_DATE = process.env.SMOKE_RES_DATE ?? '2025-12-25';
const RES_TIME = process.env.SMOKE_RES_TIME ?? '21:00';

if (!API_KEY) {
  throw new Error('API_KEY environment variable is required for smoke tests.');
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload ? JSON.stringify(payload) : response.statusText;
    throw new Error(`Request ${method} ${path} failed: ${detail}`);
  }
  return payload as T;
}

async function fetchAvailability(
  date: string,
  time: string,
  partySize = 2,
): Promise<AvailabilityResponse> {
  const search = new URLSearchParams({
    venueId: VENUE_ID,
    date,
    time,
    partySize: String(partySize),
  });
  const availability = await request<AvailabilityResponse>(
    'GET',
    `/v1/availability?${search.toString()}`,
  );
  if (!availability.tables?.length) {
    throw new Error(
      `No tables available for ${VENUE_ID} ${date} ${time} party ${partySize}`,
    );
  }
  if (availability.stats?.available === 0) {
    throw new Error(
      `Availability stats indicate zero tables for ${VENUE_ID} ${date} ${time}`,
    );
  }
  return availability;
}

async function createHold(
  date: string,
  time: string,
  tableId: string,
): Promise<HoldResponse> {
  return request<HoldResponse>(
    'POST',
    '/v1/holds',
    {
      venueId: VENUE_ID,
      date,
      time,
      partySize: 2,
      tableId,
      ttlSec: 900,
      createdBy: 'ci-smoke',
    },
    { 'x-api-key': API_KEY },
  );
}

async function convertHoldToReservation(
  holdId: string,
): Promise<ReservationResponse> {
  return request<ReservationResponse>(
    'POST',
    '/v1/reservations',
    {
      holdId,
      guest: { name: 'CI Smoke Harness' },
      channel: 'ci-smoke',
      createdBy: 'ci',
    },
    { 'x-api-key': API_KEY, 'Idempotency-Key': randomUUID() },
  );
}

async function createReservationWithIdempotency(
  date: string,
  time: string,
): Promise<{ first: ReservationResponse; second: ReservationResponse }> {
  const payload = {
    venueId: VENUE_ID,
    date,
    time,
    partySize: 2,
    guest: { name: 'CI Idempotency', email: 'ci@example.com' },
    channel: 'ci-smoke',
    createdBy: 'ci',
  };
  const key = `ci-${randomUUID()}`;
  const headers = { 'x-api-key': API_KEY, 'Idempotency-Key': key };
  const first = await request<ReservationResponse>(
    'POST',
    '/v1/reservations',
    payload,
    headers,
  );
  const second = await request<ReservationResponse>(
    'POST',
    '/v1/reservations',
    payload,
    headers,
  );

  if (first.id !== second.id) {
    throw new Error(
      `Idempotency check failed: ${first.id} !== ${second.id}`,
    );
  }

  return { first, second };
}

async function main() {
  console.log('Smoke test: availability check');
  const availability = await fetchAvailability(HOLD_DATE, HOLD_TIME);
  const tableId = availability.tables[0]?.id;
  if (!tableId) {
    throw new Error('Availability did not include a table id.');
  }

  console.log('Smoke test: creating hold');
  const hold = await createHold(HOLD_DATE, HOLD_TIME, tableId);
  if (!hold.id) {
    throw new Error('Hold response missing id');
  }

  console.log('Smoke test: converting hold to reservation');
  const converted = await convertHoldToReservation(hold.id);
  if (converted.hold?.id && converted.hold.id !== hold.id) {
    throw new Error('Converted reservation references unexpected hold id');
  }

  console.log('Smoke test: availability check for idempotency flow');
  await fetchAvailability(RES_DATE, RES_TIME);

  console.log('Smoke test: creating reservation with idempotency key');
  const { first, second } = await createReservationWithIdempotency(
    RES_DATE,
    RES_TIME,
  );

  console.log(
    JSON.stringify(
      {
        availability: {
          stats: availability.stats,
          table: tableId,
        },
        hold: hold.id,
        reservationFromHold: converted.id,
        idempotentReservation: first.id,
      },
      null,
      2,
    ),
  );

  console.log(
    `Smoke checks passed. Reservation ${first.id} was idempotent on second call ${second.id}.`,
  );
}

main().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exitCode = 1;
});

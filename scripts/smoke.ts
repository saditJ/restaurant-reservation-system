import { randomUUID } from 'node:crypto';

type HttpMethod = 'GET' | 'POST';

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
  code?: string | null;
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

const API_BASE =
  process.env.SMOKE_API_BASE ??
  process.env.API_BASE ??
  process.env.API_BASE_INTERNAL ??
  'http://127.0.0.1:3003';
const API_KEY =
  process.env.SMOKE_API_KEY ?? process.env.API_KEY ?? process.env.API_KEYS;
const VENUE_ID = process.env.SMOKE_VENUE_ID ?? 'venue-main';
const PARTY_SIZE = Number(process.env.SMOKE_PARTY_SIZE ?? '2') || 2;

if (!API_KEY || !API_KEY.trim()) {
  console.error(
    'SMOKE FAIL: API key is required. Set SMOKE_API_KEY or API_KEY (e.g. dev-local-key).',
  );
  process.exit(1);
}

function buildUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE.replace(/\/+$/, '')}${normalized}`;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  headers: Record<string, string | undefined> = {},
): Promise<T> {
  const url = buildUrl(path);
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': API_KEY,
      'x-client-app': 'smoke-check',
      ...Object.fromEntries(
        Object.entries(headers).filter(([, value]) => value !== undefined),
      ),
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload ? JSON.stringify(payload) : response.statusText;
    throw new Error(`${method} ${path} failed (${response.status}): ${detail}`);
  }
  return payload as T;
}

async function simpleGet(path: string): Promise<void> {
  const url = buildUrl(path);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`${path} responded with ${response.status}: ${text}`);
  }
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cloneDateWithOffset(days: number): Date {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

async function ensureDemoTenant(): Promise<void> {
  await simpleGet(`/v1/venues/${VENUE_ID}/settings`);
}

async function findAvailableSlot(): Promise<{
  date: string;
  time: string;
  tableId: string;
  availability: AvailabilityResponse;
}> {
  const candidateTimes = [
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
  ];

  for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
    const date = formatDate(cloneDateWithOffset(dayOffset));
    for (const time of candidateTimes) {
      try {
        const availability = await request<AvailabilityResponse>(
          'GET',
          `/v1/availability?venueId=${encodeURIComponent(
            VENUE_ID,
          )}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(
            time,
          )}&partySize=${PARTY_SIZE}`,
        );
        const tableId = availability.tables[0]?.id;
        if (tableId) {
          return { date, time, tableId, availability };
        }
      } catch {
        // ignore and try next slot
      }
    }
  }
  throw new Error(
    `Unable to find availability for venue ${VENUE_ID} (party size ${PARTY_SIZE}) within 7 days.`,
  );
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
      partySize: PARTY_SIZE,
      tableId,
      ttlSec: 900,
      createdBy: 'smoke-script',
    },
    { 'Idempotency-Key': `hold-${randomUUID()}` },
  );
}

async function convertHold(holdId: string): Promise<ReservationResponse> {
  return request<ReservationResponse>(
    'POST',
    '/v1/reservations',
    {
      holdId,
      guest: {
        name: 'Smoke Test Guest',
        email: 'smoke@example.test',
      },
      channel: 'smoke-test',
      createdBy: 'smoke-script',
    },
    { 'Idempotency-Key': `reservation-${randomUUID()}` },
  );
}

async function main() {
  console.log(`SMOKE start -> ${API_BASE} (venue=${VENUE_ID})`);

  console.log('- GET /health');
  await simpleGet('/health');

  console.log('- GET /ready');
  await simpleGet('/ready');

  console.log('- Ensure demo tenant and venue exist');
  await ensureDemoTenant();

  console.log('- Lookup availability');
  const { date, time, tableId, availability } = await findAvailableSlot();
  console.log(
    `  Found availability on ${date} ${time} with table ${tableId} (available=${availability.stats.available})`,
  );

  console.log('- Create hold');
  const hold = await createHold(date, time, tableId);
  if (!hold.id) {
    throw new Error('Hold response missing id');
  }

  console.log('- Convert hold to reservation');
  const reservation = await convertHold(hold.id);
  if (!reservation.id) {
    throw new Error('Reservation response missing id');
  }
  if (!reservation.code || !reservation.code.trim()) {
    throw new Error('Reservation response missing confirmation code');
  }

  console.log(
    `SMOKE PASS: hold ${hold.id} -> reservation ${reservation.code} on ${reservation.slotLocalDate} ${reservation.slotLocalTime}.`,
  );
}

main().catch((error) => {
  console.error(`SMOKE FAIL: ${(error as Error).message}`);
  process.exit(1);
});

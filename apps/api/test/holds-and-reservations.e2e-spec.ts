import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HoldStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { DEFAULT_VENUE_ID, ensureDefaultVenue } from '../src/utils/default-venue';
import { HoldsCleanupService } from '../src/holds.cleanup.service';

const API_KEY = 'test-key';
const BASE_DATE = '2025-01-20';
const SLOT_TIME = '18:30';
const TABLE_ID = 'T1';

describe('holds and reservations integrity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanup: HoldsCleanupService;

  beforeAll(async () => {
    process.env.API_KEYS = API_KEY;
    process.env.NOTIFICATIONS_ENABLED = 'false';

    const moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
    });

    moduleBuilder.overrideProvider(PinoLogger).useValue(createLoggerStub());

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    cleanup = app.get(HoldsCleanupService);

    await ensureDefaultVenue(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notificationOutbox.deleteMany({});
    await prisma.reservationTableAssignment.deleteMany({});
    await prisma.reservation.deleteMany({});
    await prisma.hold.deleteMany({});
  });

  const api = () => request(app.getHttpServer());

  async function createHold(ttlSec = 120) {
    return api()
      .post('/v1/holds')
      .set('x-api-key', API_KEY)
      .send({
        venueId: DEFAULT_VENUE_ID,
        date: BASE_DATE,
        time: SLOT_TIME,
        partySize: 2,
        tableId: TABLE_ID,
        ttlSec,
      });
  }

  async function createReservation() {
    return api()
      .post('/v1/reservations')
      .set('x-api-key', API_KEY)
      .send({
        venueId: DEFAULT_VENUE_ID,
        date: BASE_DATE,
        time: SLOT_TIME,
        partySize: 2,
        tableId: TABLE_ID,
        guest: { name: 'Load Test' },
      });
  }

  it('prevents double hold creation on the same slot', async () => {
    const first = await createHold();
    expect(first.status).toBe(201);

    const second = await createHold();
    expect(second.status).toBe(409);
    expect(second.body?.error?.code).toBe('CONFLICT');
  });

  it('expires short-lived holds allowing new ones', async () => {
    const response = await createHold(2);
    expect(response.status).toBe(201);
    const holdId = response.body?.id as string;
    expect(holdId).toBeTruthy();

    await delay(3200);
    // force a sweep cycle to flip status -> EXPIRED
    if (cleanup && typeof (cleanup as unknown as { safeSweep: Function }).safeSweep === 'function') {
      await (cleanup as unknown as { safeSweep: (reason: 'bootstrap' | 'interval') => Promise<void> }).safeSweep(
        'interval',
      );
    }

    const holdRecord = await prisma.hold.findUnique({ where: { id: holdId } });
    expect(holdRecord?.status).toBe(HoldStatus.EXPIRED);

    const second = await createHold();
    expect(second.status).toBe(201);
    expect(second.body?.id).toBeTruthy();
  });

  it('enforces reservation creation idempotency across concurrent requests', async () => {
    const [first, second] = await Promise.allSettled([createReservation(), createReservation()]);

    const results = [first, second].map((result) => {
      if (result.status === 'fulfilled') return result.value;
      throw result.reason;
    });

    const created = results.filter((res) => res.status === 201);
    const conflicted = results.filter((res) => res.status === 409);

    expect(created.length).toBe(1);
    expect(conflicted.length).toBe(1);
    expect(conflicted[0]?.body?.error?.code).toBe('CONFLICT');
  });
});

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createLoggerStub(): PinoLogger {
  return {
    setContext: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
    verbose: () => undefined,
    log: () => undefined,
  } as unknown as PinoLogger;
}

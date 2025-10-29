import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { PinoLogger } from 'nestjs-pino';

describe('Reservations validation (e2e)', () => {
  let app: INestApplication;
  const API_KEY = 'test-key';

  beforeAll(async () => {
    process.env.API_KEYS = API_KEY;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        enableShutdownHooks: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(false);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const logger = app.get(PinoLogger);
    app.useGlobalFilters(new HttpExceptionFilter(logger as unknown as any));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function postReservations() {
    return request(app.getHttpServer())
      .post('/v1/reservations')
      .set('x-api-key', API_KEY);
  }

  it('returns 400 when guest.name is missing', async () => {
    const response = await postReservations().send({
      venueId: 'venue-123',
      date: '2025-01-01',
      time: '18:00',
      partySize: 4,
      guest: {},
    });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when time format is invalid on update', async () => {
    const response = await request(app.getHttpServer())
      .patch('/v1/reservations/resv_123')
      .set('x-api-key', API_KEY)
      .send({
        time: '25:99',
      });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when tableIds contain a non-UUID', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/reservations/resv_123/assign')
      .set('x-api-key', API_KEY)
      .send({
        tableIds: ['not-a-uuid'],
      });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('VALIDATION_ERROR');
  });
});

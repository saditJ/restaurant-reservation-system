# Reserve Platform

Monorepo for the Reserve booking platform. This repo houses the NestJS API (`apps/api`), the B2B console (`apps/b2b-console`), the booking widget (`apps/booking-widget`), and the marketing provider site (`apps/provider`).

## Quick start

```bash
pnpm install
cp configs/.env.example apps/api/.env
cp configs/.env.example apps/b2b-console/.env.local
cp configs/.env.example apps/booking-widget/.env.local
cp configs/.env.example apps/provider/.env.local
pnpm stack:up
pnpm db:migrate
pnpm --filter api dev
pnpm --filter b2b-console dev
pnpm --filter booking-widget dev
```

Open `http://localhost:3001/status` to view API, database, and metrics health. The API exposes `GET /health`, `GET /ready`, and `GET /metrics` for probes.

Bring down the stack with `pnpm stack:down` when finished.

## Notifications

- Reservation create/update/cancel flows enqueue records in the NotificationOutbox table. Each record stores the event, channel, template variables, and delivery history.
- Delivery is processed by a standalone worker: pnpm --filter api notifications:worker. It polls pending outbox records, renders text templates (EN/AL), sends via Nodemailer (dev transport) or the Twilio stub, retries with exponential backoff, and dead-letters after five attempts.
- Feature flag: keep NOTIFICATIONS_ENABLED=false for local development. When disabled, the worker logs NOTIFICATIONS_ENABLED=false -> skipped send cycle without dequeuing jobs. Set to 	rue to deliver.
- Configure sender metadata via .env (NOTIFICATIONS_EMAIL_FROM, NOTIFICATIONS_POLL_INTERVAL_MS, NOTIFICATIONS_BATCH_SIZE, NOTIFICATIONS_MAX_ATTEMPTS, and optional TWILIO_* variables for the stub).
- The B2B console now exposes /notifications, showing delivery logs (status, attempts, errors) and a Requeue action that flips failed messages back to PENDING.
## Observability

- Structured logging via `nestjs-pino` (already configured).
- Request latency histogram exported at `GET /metrics` (`http_request_duration_seconds`).
- Metrics middleware measures every request except `/metrics` itself.
- The B2B status page calls `/metrics` and surfaces green/amber/red badges plus the `/v1/availability` p95 latency.

## Load testing

A lightweight [k6](https://k6.io) script is available at `scripts/k6/availability.js`.

```bash
k6 run scripts/k6/availability.js
```

Override defaults with environment variables, for example:

```bash
BASE_URL=http://localhost:3003/v1 VENUE_ID=venue-main VUS=10 DURATION=1m k6 run scripts/k6/availability.js
```

The script records a custom `availability_duration` trend with thresholds mirroring the status page.

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) installs dependencies, lints, type-checks, runs unit tests, validates Prisma schema, and builds every app. Failures block pull requests.

## Additional docs

- `docs/dev.local.md` � smoke test instructions.
- `docs/ops/secrets.md` � key management and rotation guidelines.
- `docs/booking-widget-embed.md` � widget integration notes.


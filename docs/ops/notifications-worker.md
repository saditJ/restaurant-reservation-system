# Notifications Worker Reliability

## Exercising integrity tests

1. Start a throwaway Postgres instance and apply the Prisma schema:

   ```bash
   docker compose up -d postgres
   set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reserve_platform_test
   pnpm db:reset
   ```

2. Run the hold/reservation integrity suite (covers duplicate holds, auto-expiry, and reservation racing):

   ```bash
   pnpm --filter api test:e2e -- holds-and-reservations
   ```

## Observability quick-checks

- Scrape the API metrics endpoint and confirm the worker counters are present:

  ```bash
  curl -s http://localhost:3003/metrics | rg 'notifications_(enqueued|sent|failed|recent|delivery_latency)'
  ```

- Visit the console status page to view the 15-minute delivery panel:

  ```text
  http://localhost:3002/status
  ```

  The panel stays green while `notifications_recent_total{status="failed",window="15m"}` remains zero.

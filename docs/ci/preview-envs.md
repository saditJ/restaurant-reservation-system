# CI Preview Environments

This document describes the extended CI workflow, smoke coverage, generated artifacts, and the ephemeral preview environments introduced for pull requests.

## Workflow Overview

The `CI` workflow now consists of staged jobs that build confidence before opening a preview:

- **build** – installs dependencies, runs lint/typecheck/unit tests, builds workspaces, and exports the OpenAPI document (`apps/api/openapi.json`).
- **db** – starts Postgres/Redis services, validates the Prisma schema, and ensures migrations apply cleanly.
- **migrate_seed** – reapplies migrations, seeds demo data, and runs `pnpm db:check` to verify baseline records.
- **api** – builds the API, boots it on port `3003`, and exercises `/ready` + `/health` while capturing logs for troubleshooting.
- **smoke** – repeats the full stack setup, executes programmatic smoke tests, runs a short k6 check against `/v1/availability`, and uploads the k6 summary artifact.
- **preview** (PR only) – provisions a docker-compose stack (Postgres, Redis, API), creates a temporary admin API key, exposes the service via a temporary `trycloudflare.com` tunnel, posts a PR comment, keeps the stack alive for 5 minutes, and tears everything down.

Each job uses fresh runners, so migrations and seeds remain idempotent.

## Smoke Coverage

The smoke stage runs two complementary checks while the API is live on `http://127.0.0.1:3003`:

1. `scripts/ci/smoke.ts` (run with `pnpm exec tsx scripts/ci/smoke.ts` or `pnpm ci:smoke`) performs a basic functional flow:
   - Fetches `/v1/availability` for `venue-brooklyn`.
   - Creates a hold and converts it to a reservation via `/v1/holds` and `/v1/reservations` (Idempotency-Key included).
   - Creates an additional reservation with the same Idempotency-Key to assert idempotent behaviour.

2. `k6 run scripts/k6/availability.js --summary-export=artifacts/k6-summary.json` runs a lightweight load check (1 VU for 10s). The helper `scripts/ci/k6-summary.ts` extracts the availability `p95` latency into `artifacts/k6-summary.txt` for quick scanning.

You can reproduce the entire stage locally once Postgres/Redis are up:

```bash
pnpm db:migrate:deploy
pnpm db:seed
pnpm --filter api build
pnpm --filter api start:prod
# in another terminal
pnpm ci:smoke
k6 run scripts/k6/availability.js --duration 10s --vus 1
```

`scripts/ci/wait-for-services.ts` is used throughout CI to hold until the database and cache accept connections (configurable via `CI_WAIT_RETRIES` / `CI_WAIT_DELAY_MS`).

## Artifacts

The workflow uploads artifacts for later inspection:

- **openapi-json** – `apps/api/openapi.json` generated from the Nest application (available after the `build` job).
- **smoke-artifacts** – contains `artifacts/k6-summary.json` and a condensed `k6-summary.txt` with the availability `p95` latency in milliseconds.
- **api-logs / api-logs-smoke** – API stdout/stderr captured when the `api` or `smoke` jobs fail (uploaded conditionally with `if: failure()`).

These files make it easy to compare OpenAPI changes, review k6 percentiles, or diagnose a failing boot sequence without re-running CI.

## Preview Environments

Pull requests automatically receive a short-lived preview stack:

1. CI starts Postgres and Redis via `docker compose up -d postgres redis`.
2. It runs migrations + seeds on the runner, then generates a dedicated API key with `scripts/ci/create-preview-key.ts`.
3. `docker compose --profile preview up -d api` builds and launches the API container defined in `apps/api/Dockerfile` (see `docker-compose.yml`).
4. A `cloudflared` tunnel exposes the service publicly. The first discovered `https://<random>.trycloudflare.com` URL is exported for later steps.
5. A PR comment is posted with health links and the temporary admin key (masked in logs but visible to reviewers).
6. The tunnel stays alive for `PREVIEW_TTL_SECONDS` (default 300 seconds). Afterwards the tunnel is terminated and `docker compose down --volumes --remove-orphans` tears down the stack.

### Example PR Comment

```
### Preview Environment
• API ready: https://acme-123.trycloudflare.com/ready
• Swagger UI: https://acme-123.trycloudflare.com/docs (use x-api-key)
• Admin key: `rk_example-preview-key`

_Preview will be torn down after this workflow completes._
```

### Local debugging

- Launch the same stack locally with `docker compose --profile preview up -d postgres redis api` (set `PII_SECRET`, `SWAGGER_API_KEY`, and `API_KEY` in your shell as needed).
- Review API logs with `docker compose logs -f api` or inspect the tunnel output saved to `tunnel.log` in CI.
- Adjust the preview lifetime by setting `PREVIEW_TTL_SECONDS` on the workflow dispatch (or export it before running the preview job locally).
- To regenerate the short-lived key manually: `pnpm exec tsx scripts/ci/create-preview-key.ts --name "Preview local"` and distribute the printed plaintext.

If a preview fails, check `docker compose logs api` and the workflow artifact logs. Because the tunnel prints its URL to `tunnel.log`, that file is the first place to look when no link appears in the PR comment.

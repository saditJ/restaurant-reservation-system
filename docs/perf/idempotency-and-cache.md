# Idempotency Keys and Availability Cache

This service now guards the busiest read and write paths with Redis-backed caching and persisted idempotency keys so repeat traffic stays fast and side-effect free.

## Idempotency Keys

- Supported on `POST /v1/reservations` and `POST /v1/holds`.
- Clients opt in by sending an `Idempotency-Key` header (case insensitive). Keys are trimmed and truncated at 200 characters.
- The interceptor stores the first completed response for a key along with the HTTP method, canonical path (no query string, no trailing slash), a SHA-256 hash of the JSON request body, response payload, headers, and status code.
- Stored entries expire automatically after 24 hours; an on-read/background sweeper deletes expired rows.
- A replay with the same key, method, path, and payload returns the original status/body/headers and increments `idempotency_hits_total`.
- Reusing a key for a different route or payload returns `409 { error: { code: "CONFLICT", message: "Idempotency key reuse with different payload" } }`, increments `idempotency_conflicts_total`, and bypasses the handler.

### Storage Details

- Prisma model: `IdempotencyKey(id, method, path, bodyHash, status, response, createdAt, expiresAt)`.
- Responses are stored as JSON (`response.body`, `response.headers` minus dynamic headers such as `Content-Length`).
- Redis is not used for idempotency; entries live in Postgres so they survive process restarts.

## Availability Cache

- Endpoint: `GET /v1/availability`.
- Read-through cache wraps the endpoint via `CacheMetricsInterceptor`.
- Cache key: `avail:${venueId}:${date}:${partySize}:${policyHash}` where `policyHash = sha1({ time, area, tableId })`.
- TTL: random 30-60 seconds to avoid thundering herds.
- Cache hits and misses update `cache_hits_total` and `cache_misses_total`.
- Invalidation triggers on any reservation or hold create/update/status change/delete for the affected `venueId` and `date`. Keys are purged by prefix scan so every party size and policy variant for that day is dropped.

## Operational Notes

- Redis is added to `docker-compose.yml` (`redis:7` on `6379`). The API reads `REDIS_URL` via env (`redis://localhost:6379/0` by default).
- Metrics at `/metrics` now expose `cache_hits_total`, `cache_misses_total`, `idempotency_hits_total`, and `idempotency_conflicts_total`.
- When Redis is unavailable the cache layer safely degrades (miss recorded, request still served).

## Client Guidance

1. Generate a unique idempotency key per logical reservation or hold create attempt (UUID works well).
2. Retry the original request with the same key if you receive network errors or timeouts; the API will replay the stored response.
3. Never reuse a key for a different payload or endpoint because this now produces a hard `409` conflict.
4. Availability data may be stale for up to roughly 60 seconds. Creating, modifying, or cancelling holds/reservations flushes the relevant venue/day shard immediately.

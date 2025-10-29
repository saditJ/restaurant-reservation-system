# Webhooks

The platform now emits signed webhooks whenever reservations change. This guide covers the
available events, delivery behaviour, signature verification, and local testing utilities.

## Events

Webhooks are published for the following reservation lifecycle events:

- `reservation.created`
- `reservation.updated`
- `reservation.cancelled`
- `reservation.seated`
- `reservation.completed`

The payload schema matches the OpenAPI document served by the API. Each delivery contains
```json
{
  "id": "evt_xxx",
  "event": "reservation.created",
  "attempt": 1,
  "createdAt": "2025-01-02T12:00:00.000Z",
  "data": {
    "reservation": {
      "id": "res_123",
      "code": "RABC123",
      "status": "CONFIRMED",
      "guestName": "Guest",
      "slotLocalDate": "2025-01-03",
      "slotLocalTime": "19:00",
      "slotStartUtc": "2025-01-03T18:00:00.000Z",
      "partySize": 2,
      "venueId": "v_default"
    }
  }
}
```

## Delivery behaviour

- Webhooks are dispatched by `apps/api` using the new queue tables `WebhookEndpoint` and `WebhookDelivery`.
- Every delivery is signed with `sha256` HMAC using `WEBHOOK_SECRET`.
- Headers attached to each request:
  - `X-Reserve-Event`: the event name.
  - `X-Reserve-Delivery`: unique delivery identifier.
  - `X-Reserve-Timestamp`: UNIX seconds used for the signature.
  - `X-Reserve-Signature`: `t=<timestamp>,v1=<hex digest>`.
- Failed deliveries are retried with exponential backoff (1m ? 2m ? 4m … max 30m) up to 8 attempts
  before being marked `FAILED`.
- Manual re-delivery can be triggered through:
  - `POST /v1/webhooks/deliveries/:id/redeliver`
  - The developer console in the B2B app.

## Required configuration

```
# apps/api/.env
WEBHOOK_SECRET=your-shared-secret
WEBHOOKS_POLL_INTERVAL_MS=5000
WEBHOOKS_BATCH_SIZE=10
WEBHOOKS_MAX_ATTEMPTS=8
```

Restart the API after setting the secret. In non-production environments, swagger is gated by an API
key (either an entry in `API_KEYS` or `SWAGGER_API_KEY`).

Run the delivery worker alongside the API:

```bash
pnpm --filter api webhooks:worker
```

## Local testing

1. Start the mock receiver (validates signatures and prints payloads):

   ```bash
   WEBHOOK_SECRET=your-shared-secret pnpm tsx scripts/mock-webhook-receiver.ts
   ```

   The server listens on `http://localhost:4005` by default.

2. In the B2B console, open **Settings ? Developers** and register `http://localhost:4005` as an endpoint.
3. Create or update a reservation; deliveries will appear immediately in the developer console and the
   mock receiver.

### Verify signatures manually

```bash
export WEBHOOK_SECRET="your-shared-secret"
timestamp=$(date -u +%s)
payload='{"id":"evt_test_123","event":"reservation.created","attempt":1,"createdAt":"2025-01-01T12:00:00.000Z","data":{"reservation":{"id":"res_demo_123","code":"RABC123","status":"CONFIRMED"}}}'
signature=$(printf "%s.%s" "$timestamp" "$payload" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | xxd -p -c 256)

curl -X POST https://your-app.example/webhooks \
  -H "Content-Type: application/json" \
  -H "X-Reserve-Timestamp: $timestamp" \
  -H "X-Reserve-Signature: t=$timestamp,v1=$signature" \
  -d "$payload"
```

## SDK & OpenAPI generation

The API exposes an OpenAPI document at `/docs-json` (available in non-production environments with an
API key). The repository includes a typed SDK shared by the web clients.

Generate updated definitions whenever the API surface changes:

```bash
pnpm --filter api openapi:generate
pnpm --filter sdk generate
pnpm --filter sdk build
```

This regenerates `apps/api/openapi.json`, the TypeScript bindings under `packages/sdk/src/generated.ts`, and
rebuilds the ESM bundle in `packages/sdk/dist`.

## Developer console

The B2B app now includes a **Developers** page under Settings that lets you:

- Copy your webhook signing secret.
- Register new endpoints.
- Filter and inspect recent deliveries per endpoint.
- Trigger manual re-delivery.
- View a copy-ready signature verification snippet.

All operations use the generated SDK (`@reserve/sdk`) to talk to the API, ensuring type-safe requests
from both web clients.


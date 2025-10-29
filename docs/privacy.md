# Guest Privacy Controls

This release introduces encryption at rest for guest contact fields, dedicated privacy endpoints, audit logging, and automated retention.

## Configuration

- `PII_SECRET` (required): 32-byte base64/hex/plain key used for AES-256-GCM encryption.
- `PII_KEY_VERSION` (optional, default `v1`): string recorded with each encrypted record.
- `PRIVACY_BACKFILL_BATCH` (optional): batch size for the backfill script (default 250).
- `PRIVACY_RETENTION_BATCH` (optional): batch size for the retention worker (default 200).

Venue policies now include `retainPersonalDataDays` (default **365**). Policies can be updated via the existing settings screen or `PUT /v1/venues/:id/policies`.

## Data encryption

The Prisma client applies middleware that:

1. Encrypts `Reservation.guestEmail` and `Reservation.guestPhone` using AES-256-GCM before writes.
2. Stores deterministic HMAC hashes (`guestEmailSearch`, `guestPhoneSearch`) plus `guestPhoneLast4` for searchability.
3. Decrypts the values on reads, transparently exposing plaintext to the application layer.

Existing records can be re-encrypted by running:

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
pnpm --filter api prisma:generate
pnpm --filter api prisma:generate # optional if Prisma client already generated
pnpm --filter api privacy:backfill
```

The backfill script lives at `scripts/privacy-backfill.ts`.

## API surface

All privacy endpoints require an admin API key.

### `GET /v1/privacy/guest/export?email=...`
Return reservations (with decrypted name/email/phone) for the supplied guest. The audit log records the export with a hashed guest resource id.

### `POST /v1/privacy/guest/erase`
Request body: `{ "email": "guest@example.com" }`

Anonymises completed/cancelled reservations for the guest, replacing contact details with deterministic tokens, redacting notes, and storing the anonymisation metadata (`piiAnonymizedAt`, `piiAnonymizedReason`, `piiAnonymizedToken`). Reservations in the future are skipped and reported.

### `GET /v1/audit/logs`
Query parameters: `actor`, `action`, `resource`, `from`, `to`, `limit` (default 50). Returns `{ total, items }` where each item contains before/after JSON payloads.

## Audit logging

`AuditLog` entries capture:

- `actor` (`api-key:...`, `worker:privacy-retention`, etc.)
- `action` (e.g. `privacy.export`, `privacy.erase`, `venue.policies.update`)
- `resource` (`guest:<hash>`, `venue:<id>`, `reservation:<id>`)
- `before` / `after` JSON payloads with PII removed or token-tail only

The B2B console now offers an **Audit** page (`/audit`) with filtering and expandable before/after payloads.

## Retention worker

`src/workers/privacy.retention.worker.ts` anonymises reservations automatically:

- Runs against venues using `retainPersonalDataDays`.
- Targets `COMPLETED` and `CANCELLED` reservations older than the venue's window.
- Reuses the same anonymisation tokens/reason (`retention`).
- Logs each change to the audit log.

Run manually with:

```bash
pnpm --filter api privacy:retention
```

Schedule via cron/Process Manager as needed.

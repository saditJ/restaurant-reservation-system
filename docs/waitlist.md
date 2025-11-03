# Waitlist

## Data Model

- Prisma migration: 20251103_waitlist_minimal
- Table: Waitlist
  - id (cuid) primary key
  - venueId -> venues.id (cascade)
  - name (guest supplied)
  - emailEnc, phoneEnc encrypted with AES-256-GCM (pii-crypto util)
  - partySize (int)
  - desiredAt (UTC timestamp when guest prefers to dine)
  - notes (optional)
  - priority (int, default 0)
  - status (WAITING | OFFERED | EXPIRED | CONVERTED)
  - offerCode (unique, nullable)
  - offerToken (nullable short-lived token for deep links)
  - holdId (unique, nullable -> holds.id, on delete set null)
  - expiresAt (UTC timestamp for current offer expiry)
  - createdAt / updatedAt
  - Indexes: (venueId, status) and (venueId, desiredAt) to support filtering

Associated relations:
- Hold.waitlistEntry so converted holds automatically mark the entry CONVERTED
- Venue.waitlist for admin views and seed helper

Seed data adds two WAITING rows for the default venue (Mock Bistro) with encrypted contact details. Comm templates now include OFFER for all venues.

## API Surface

All endpoints live under /v1/waitlist and require API key authentication; admin operations require the admin scope.

| Method | Path | Notes |
| --- | --- | --- |
| POST | /v1/waitlist | Create a WAITING entry (encrypts email/phone before persisting). Idempotent via interceptor. |
| GET | /v1/waitlist | List entries (filters: venueId, status, desiredFrom, desiredTo, limit). Returns decrypted contact info for admin callers. |
| POST | /v1/waitlist/:id/offer | Generates 8-char offer code, picks a table via AvailabilityService, creates a Hold, marks entry OFFERED, stores hold/expiry. Idempotent. |
| POST | /v1/waitlist/:id/expire | Cancels the associated hold (if active) and marks the entry EXPIRED. |
| POST | /v1/waitlist/:id/convert | Manual override to mark an entry CONVERTED (reservation conversion already triggers this automatically). |
| GET | /v1/waitlist/offer/:code?token=... | Widget lookup for deep-link. Returns hold + waitlist metadata when the token matches and the offer is still valid; otherwise 404 (invalid) or 410 (expired). |
| POST | /v1/waitlist/offer/:code/convert | Widget call after reservation success. Marks the waitlist entry CONVERTED when provided with the matching token. |
| GET | /v1/waitlist/offers/recent | Admin-only list of recent offers sent (reads from audit log). |

### Offer Resolution Response

```
{
  "waitlistId": "...",
  "holdId": "...",
  "venueId": "venue-main",
  "partySize": 4,
  "startAt": "2025-12-24T18:00:00.000Z",
  "slotLocalDate": "2025-12-24",
  "slotLocalTime": "19:00",
  "expiresAt": "2025-12-24T17:15:00.000Z",
  "guestName": "Jordan Blake",
  "guestEmail": "jordan.blake@example.com",
  "guestPhone": "+1 415 555 0198"
}
```

The booking widget consumes this response to pre-fill the confirmation page and call the existing hold -> reservation flow with an Idempotency-Key header.

## Promoter Worker

- File: apps/api/src/waitlist/waitlist.promoter.ts
- Polls every 60 seconds.
- Fetches the highest-priority WAITING entries (batch = 10).
- Uses AvailabilityPolicyService.evaluateDay to locate the first slot >= desiredAt with remaining capacity (looks up to 1 day ahead).
- Calls WaitlistService.offer (which creates the Hold via HoldsService) with ttlMinutes = 15.
- Builds the deep-link http://localhost:3002/r/<offerCode>?token=<offerToken> and sends an OFFER email via CommService (MailHog during dev).
- Records a `waitlist.offer.sent` audit log entry for back-office reporting.
- The offer link base can be overridden via `WAITLIST_OFFER_BASE_URL` (defaults to `http://localhost:3002/r`).
- On errors (slot conflict, missing tables, SMTP outages) the worker logs and keeps polling.

TTL semantics:
- Default TTL is 15 minutes; admin callers can override with ttlMinutes (clamped between 5 and 180).
- On expiry, the hold is cancelled and offerCode/holdId/expiresAt are cleared.
- Reservation conversion (either via widget or admin) consumes the hold and the waitlist row transitions to CONVERTED automatically.

## Deep-link Flow

1. Create waitlist entry (admin/API):
   ```bash
   curl -X POST http://localhost:3003/v1/waitlist \
     -H 'x-api-key: dev-local-key' \
     -H 'content-type: application/json' \
     -d '{
       "name": "Taylor Guest",
       "email": "taylor@example.com",
       "phone": "+1 415 555 0100",
       "partySize": 3,
       "desiredAt": "2025-12-24T19:00:00.000Z"
     }'
   ```
2. Issue an offer (admin console or API):
   ```bash
   curl -X POST http://localhost:3003/v1/waitlist/<waitlistId>/offer \
     -H 'x-api-key: dev-local-key' \
     -H 'content-type: application/json' \
     -d '{ "slotStart": "2025-12-24T19:00:00.000Z", "ttlMinutes": 15 }'
   ```
   Response includes the generated offerCode, a short-lived offerToken, and the linked hold metadata.
3. Deep-link resolution for the widget:
   ```bash
   curl "http://localhost:3003/v1/waitlist/offer/<offerCode>?token=<offerToken>" -H 'x-api-key: dev-local-key'
   ```
   A 200 response indicates the hold is still valid; a 410 means the offer expired.
4. After converting the hold into a reservation, the widget calls:
   ```bash
   curl -X POST "http://localhost:3003/v1/waitlist/offer/<offerCode>/convert" \
     -H 'x-api-key: dev-local-key' \
     -H 'content-type: application/json' \
     -d '{ "token": "<offerToken>" }'
   ```

Guest email contains http://localhost:3002/r/<offerCode>?token=<offerToken>. The booking widget fetches the offer with the token-protected API, displays the held slot, and on confirmation posts to /v1/reservations with the hold id (using Idempotency-Key). After a successful reservation, it posts to /waitlist/offer/<code>/convert to mark the entry CONVERTED; the hold is already consumed by the reservation workflow.

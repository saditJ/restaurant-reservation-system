# Seating Suggestions

This feature introduces table set recommendations and assignment workflows for confirmed reservations. Suggestions are scored to keep table wear even, minimise splits, and avoid unnecessary capacity.

## Scoring

Each candidate table set is scored as:

- `wearMax * 100000` – maximum turns for any table that day (lower is better).
- `wearTotal * 1000` – total turns across the set.
- `splitCount * 100` – number of tables in the set.
- `excessCapacity` – seats above the party size.

Candidates are sorted by score, then by split count, total capacity, and table id order. Single tables naturally win because of the split penalty.

## API

- `POST /v1/reservations/:id/suggestions` → `SeatingSuggestionsResponse`
- `POST /v1/reservations/:id/assign` → updated `Reservation`

Assignments are transactional: advisory locks are taken for every target table and conflicts return HTTP 409.

## Seed data

The default seed now includes two three-top tables (`T6`, `T7`, join group `DIN-TRIO-A`) and a demo reservation `SEAT-DEMO-1` (five guests, unassigned).

To load:

```
pnpm prisma migrate dev
pnpm prisma db seed
```

## Manual verification steps

1. Start the API (`pnpm --filter api dev`) and B2B console (`pnpm --filter b2b-console dev`).
2. Open the reservations page and locate code `SDEMO1` (status `CONFIRMED`).
3. Click **Seat**; the modal fetches suggestions. Expect:
   - First option: single table `T5` (capacity 6, lowest wear).
   - Fallback option: joined tables `T6 + T7` (both join group `DIN-TRIO-A`).
4. Pick the joined-table option. The row should update instantly showing `T6 + T7`, status `SEATED`; if the status API fails, the UI rolls back.
5. Retry the same action to ensure 409 conflicts display the inline error and the UI reverts.

The floor view highlights each booked table because conflicts now carry `tableIds` for multi-table assignments.

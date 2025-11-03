# Availability Policy v2

This document captures how the second-generation availability policy pipeline works and how to reason about the data that powers it.

## Components

### Shifts
- Stored in `Shift` with `dow` (0–6), `startsAtLocal`, `endsAtLocal`, per-shift seat/cover capacity, and `isActive` flag.
- Times are persisted as `TIME` columns and generated in venue local time via Temporal to survive DST transitions.
- Slots are generated in `AvailabilityPolicyService.generatePolicySlots`; overnight shifts clip to the target service day, and the Temporal API skips nonexistent hours (DST forward) or duplicates the repeated 2AM (DST back).

### Pacing Rules
- `PacingRule` defines the rolling window (`windowMinutes`) plus optional `maxReservations` and `maxCovers` caps applied per window.
- Policy hash includes every rule row; any change invalidates cached responses (see Caching below).

### Service Buffers
- `ServiceBuffer` is per venue (`beforeMinutes`/`afterMinutes`).
- Buffers trim the start/end of each shift before slot generation, ensuring setup/tear-down padding is applied consistently.

### Blackout Dates
- `BlackoutDate` holds single-date closures. Policy evaluation short-circuits to a single `reason: 'blackout'` slot with zero capacity for those days.
- Admin endpoints (`/v1/admin/blackouts`) manage these rows and seed defaults cover NYE.

## DST Handling
- All slot math uses `Temporal.ZonedDateTime` in the venue’s timezone (default `Europe/Tirane`). Missing hours are skipped automatically and repeated hours produce distinct UTC instants.
- Seeds store shift `startsAtLocal`/`endsAtLocal` as UTC time-of-day anchors, but policy evaluation reinterprets them in the target timezone to maintain intended wall clock ranges through DST changes.

## Caching & Invalidation
- Availability responses are cached for 45 s at `avail:{venueId}:{date}:{partySize}:{policyHash}`.
- `policyHash` is a deterministic SHA1 over shifts, pacing rules, blackout dates, and service buffer metadata. Any policy change for the venue yields a new hash, producing cache misses without manual invalidation.
- Reservation and hold mutations still call `CacheService.invalidateAvailability` for the affected `venue/date`. The wildcard delete removes all party-size/policyHash variants covering that service day.

## Admin API Overview

| Resource | Endpoint | Notes |
| --- | --- | --- |
| Shifts | `GET/POST/PATCH/DELETE /v1/admin/shifts` | Accepts/returns local HH:MM strings; converts to `DateTime@db.Time` internally. |
| Pacing Rules | `GET/POST/PATCH/DELETE /v1/admin/pacing-rules` | Define window + caps; usually keep single rule per venue. |
| Blackouts | `GET/POST/PATCH/DELETE /v1/admin/blackouts` | Dates are YYYY-MM-DD; PATCH can tweak `reason`. |
| Service Buffers | `GET/PUT /v1/admin/service-buffers` | Upsert semantics with before/after minutes. |

All routes require API + admin guards; include `x-api-key` for auth when executing scripts.

## Operational Notes

1. **Seed Data** – `prisma/seed.ts` creates a full policy set (shifts Sun–Thu 12:00–22:00, Fri/Sat 18:00–23:00, pacing window 15m, service buffer 10/15, NYE blackout 2025-12-31).
2. **Metrics** – `availability_policy_eval_total{venueId}` increments per policy evaluation (cache hit or miss). Combine with cache hit/miss counters to diagnose behaviour.
3. **Smoke Testing** – Use `scripts/demo/availability-smoke.ps1` (see below) to validate CRUD flow, cache invalidation, and policy hash usage end-to-end.

## Smoke Script Inputs

The demo script expects the following environment variables (override as needed):

```powershell
$env:API_BASE_URL      # default http://localhost:3000
$env:API_KEY           # admin API key for guarded endpoints
$env:VENUE_ID          # defaults to venue-main
$env:PARTY_SIZE        # defaults to 2
$env:DATE              # optional override; script uses tomorrow by default
```

Running the script will:
1. List current shifts (`GET /v1/admin/shifts?venueId=...`).
2. Create a blackout for tomorrow (`POST /v1/admin/blackouts`).
3. Query availability → zero slots.
4. Delete the blackout → availability returns slots again.
5. Create a reservation for the first slot and re-query → the slot’s `remaining` decreases and the cache is bypassed.

Consult `Runbook` below for the commands necessary to build the environment the scripts depend on.

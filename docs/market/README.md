# Reserve Market App

## Overview
- **Location**: `apps/market`
- **Stack**: Next.js App Router (SSR by default), React 19, Tailwind CSS v4
- **Purpose**: Public marketplace that aggregates venues and deep-links into the Reserve booking widget.

The home page (`/`) renders a hero, a search scaffold, and a featured venues grid.
Individual venue pages (`/r/[slug]`) surface venue details and drive guests into the booking widget.

All data access flows through server-only helpers so that internal API keys are never exposed to browsers.

## Request Flow
1. Client components request data from `/api/**`.
2. The catch-all route handler at `apps/market/src/app/api/[...path]/route.ts` forwards the request to `API_BASE_INTERNAL` (defaults to `http://localhost:3003`).
3. The handler injects the `x-api-key` header server-side and mirrors the upstream response back to the browser.

Key safeguards:
- Secrets live in environment variables; the proxy is the only layer that reads them.
- Only minimal headers are forwarded downstream.
- The proxy intentionally prefixes non-health requests with `/v1` to reduce duplication across callers.

## Server Helpers
- `apps/market/src/lib/api.ts`
  - Provides `getFeaturedVenues` and `getVenueProfile` functions.
  - Relies on the proxy route via `fetchFromProxy` and falls back to mocked content if the upstream endpoint is still pending.
  - Marked `server-only` to prevent accidental client imports.
- `apps/market/src/lib/format.ts`
  - Presentation helpers for price tiers and cuisine lists.
- `apps/market/src/lib/links.ts`
  - Generates booking widget URLs while keeping query construction in one place.

## Booking Widget Contract
- Deep link origin: `http://localhost:3002` (fixed for local development).
- URL format: `/?venueId=<venue-id>&date=<YYYY-MM-DD>&partySize=<integer>`
- The helper `buildBookingWidgetLink` enforces the structure above and defaults the date to "today" and the party size to `2`.
- UI components use `BookButton` to ensure consistent styling & link generation.

## Extending the Market
- Replace the mocks in `lib/api.ts` when `/api/v1/market/featured` and `/api/v1/market/venues/:slug` endpoints are ready.
- Wire the search scaffold by adding a new API method and swapping the disabled form in `SearchBar`.
- Introduce geo filters or menus by extending the server helpers--keep all upstream calls behind the proxy to avoid leaking credentials.

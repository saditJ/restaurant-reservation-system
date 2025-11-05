# DST-Safe Availability Engine

## Overview

This implementation provides a robust, timezone-aware availability engine that generates accurate time slots across DST transitions. The engine uses `date-fns-tz` for proper timezone handling and ensures that availability calculations remain stable during spring-forward and fall-back events.

## Architecture

### Core Components

1. **`src/common/time.ts`** - DST-safe timezone utilities
   - `addMinutesTz()` - Add minutes in a specific timezone, preserving DST
   - `startOfDayTz()` - Get midnight in a timezone as UTC Date
   - `toUTC()` - Convert local date-time to UTC
   - `fromUTC()` - Convert UTC to local date-time
   - `getDayOfWeekTz()` - Get day of week in a timezone
   - Helper functions for time manipulation

2. **`src/availability/availability.engine.ts`** - Core availability engine
   - `computeAvailability()` - Main engine function
   - `buildBaseTimeline()` - Generate slots from shifts (respecting timezone)
   - `applyBlackouts()` - Filter blackout dates
   - `applyServiceBuffer()` - Apply lead/trailing time constraints
   - `applyPacingRules()` - Enforce reservation throttling
   - `computeOccupiedTables()` - Calculate table occupancy

3. **`src/availability.service.ts`** - Service integration
   - `getAvailabilitySlots()` - New method using engine
   - `getAvailability()` - Existing method (backward compatible)

4. **`src/availability.controller.ts`** - HTTP endpoints
   - `GET /v1/availability/slots` - New endpoint for engine-based slots
   - `GET /v1/availability` - Existing endpoint (unchanged)

## API Endpoints

### New: GET /v1/availability/slots

Returns time slots with detailed availability information across a date range.

**Query Parameters:**
- `venueId` (optional) - Venue ID (defaults to default venue)
- `startDate` (required) - Start date in YYYY-MM-DD format
- `endDate` (optional) - End date in YYYY-MM-DD format
- `partySize` (optional) - Number of guests (defaults to 2)
- `area` (optional) - Filter by area

**Response:**
```json
{
  "slots": [
    {
      "startUtc": "2025-03-09T18:00:00.000Z",
      "endUtc": "2025-03-09T20:00:00.000Z",
      "localDate": "2025-03-09",
      "localTime": "14:00",
      "durationMinutes": 120,
      "capacityTotal": 10,
      "capacityAvailable": 7,
      "availableTables": [
        {
          "id": "table_1",
          "label": "T1",
          "capacity": 4,
          "area": "main",
          "zone": "window"
        }
      ],
      "isPacingConstrained": false,
      "pacingUsed": 2,
      "pacingLimit": 10
    }
  ],
  "summary": {
    "totalSlots": 48,
    "availableSlots": 40,
    "blockedSlots": 8
  }
}
```

### Existing: GET /v1/availability

Unchanged - maintains backward compatibility for single time slot queries.

## DST Safety

### Key Principles

1. **Timezone-First Arithmetic**: All time calculations use the venue's timezone as the reference. We never add minutes to naive UTC times when deriving local times.

2. **date-fns-tz Integration**: Uses `fromZonedTime()` and `toZonedTime()` for proper timezone conversions that respect DST rules.

3. **Shift Timeline Building**: Shifts are converted to UTC ranges using timezone-aware conversions, ensuring overnight shifts work correctly across DST boundaries.

### DST Transition Handling

#### Spring Forward (e.g., 2025-03-09 in America/New_York)
- Clock jumps from 2:00 AM → 3:00 AM (skipping 1 hour)
- Engine generates slots before and after the transition
- No slots generated for the non-existent hour (2:00-3:00 AM)
- Continuous UTC timeline ensures no duplicate or missing slots

#### Fall Back (e.g., 2025-11-02 in America/New_York)
- Clock falls back from 2:00 AM → 1:00 AM (repeating 1 hour)
- Engine generates slots using UTC timeline
- First occurrence of 1:00-2:00 AM (pre-fallback)
- Second occurrence of 1:00-2:00 AM (post-fallback)
- Both are distinct UTC instants, no ambiguity

### Example: Europe/Tirane (Venue Default Timezone)

**Spring Forward: 2025-03-30** (2:00 AM → 3:00 AM)
```
Before: 01:45 → 03:00 (UTC: 00:45 → 01:00)
No slots at 02:00-03:00 local time
After: 03:00 → 04:00 (UTC: 01:00 → 02:00)
```

**Fall Back: 2025-10-26** (3:00 AM → 2:00 AM)
```
First 02:00: UTC 00:00 (before fallback)
Second 02:00: UTC 01:00 (after fallback)
Engine treats both as distinct slots in UTC
```

## Engine Logic

### 1. Build Base Timeline
```typescript
buildBaseTimeline(timezone, startDate, endDate, shifts, intervalMinutes)
```
- Iterate through each day in the date range
- Get day of week in the venue's timezone
- Find active shifts for that day
- Convert shift start/end times from local to UTC
- Handle overnight shifts (endTime < startTime)
- Generate slots at `intervalMinutes` intervals (default: 15)

### 2. Apply Blackouts
```typescript
applyBlackouts(slots, blackoutDates, timezone)
```
- Convert each slot's UTC time back to local date
- Filter out slots that fall on blackout dates
- Uses timezone-aware date comparison

### 3. Apply Service Buffer
```typescript
applyServiceBuffer(slots, serviceBuffer)
```
- Filter slots based on lead time (`beforeMinutes`)
- Optionally apply trailing time (`afterMinutes`)
- Ensures customers can't book too close to now

### 4. Compute Occupancy
```typescript
computeOccupiedTables(slotStart, slotEnd, reservations, holds, ...)
```
- For each reservation/hold, calculate its blocking window
- Blocking window = duration + turnTime + bufferMinutes
- Check if reservation/hold overlaps with the slot
- Mark occupied tables in a Set

### 5. Apply Pacing Rules
```typescript
applyPacingRules(slots, pacingRules, reservations, holds)
```
- Group slots by pacing window (e.g., 15-minute buckets)
- Count existing reservations/holds in each window
- Apply `maxReservations` limit per window
- Mark slots as pacing-constrained if limit reached

## Configuration

### Venue Settings (Prisma Schema)
```prisma
model Venue {
  timezone               String   @default("Europe/Tirane")
  turnTimeMin            Int      @default(10)
  defaultDurationMin     Int      @default(120)
  pacingPerQuarterHour   Int      @default(4)
}
```

### Shifts
```prisma
model Shift {
  dow            Int      // 0 (Sunday) - 6 (Saturday)
  startsAtLocal  DateTime @db.Time(0)
  endsAtLocal    DateTime @db.Time(0)
  isActive       Boolean  @default(true)
}
```

### Availability Rules
```prisma
model AvailabilityRule {
  minPartySize     Int
  maxPartySize     Int
  slotLengthMinutes Int
  bufferMinutes    Int @default(0)
}
```

### Pacing Rules
```prisma
model PacingRule {
  windowMinutes   Int
  maxReservations Int?
  maxCovers       Int?
}
```

### Service Buffer
```prisma
model ServiceBuffer {
  beforeMinutes Int @default(0)  // Lead time
  afterMinutes  Int @default(0)  // Trailing time
}
```

### Blackout Dates
```prisma
model BlackoutDate {
  date   DateTime @db.Date
  reason String?
}
```

## Testing

### Unit Tests
- `src/common/time.spec.ts` - DST transition tests
  - Spring forward scenarios (America/New_York, Europe/Tirane)
  - Fall back scenarios
  - Non-DST timezone verification (Asia/Tokyo)
  - Continuous slot generation across transitions

### Manual Testing

**Test DST Spring Forward:**
```bash
curl "http://localhost:3003/v1/availability/slots?startDate=2025-03-09&endDate=2025-03-09&partySize=2&venueId=<venue-id>"
```

**Test DST Fall Back:**
```bash
curl "http://localhost:3003/v1/availability/slots?startDate=2025-11-02&endDate=2025-11-02&partySize=4&venueId=<venue-id>"
```

**Test Multi-Day Range:**
```bash
curl "http://localhost:3003/v1/availability/slots?startDate=2025-03-08&endDate=2025-03-10&partySize=2"
```

## Dependencies

- `date-fns` ^4.1.0 - Core date manipulation
- `date-fns-tz` ^3.2.0 - Timezone support with DST handling
- `@prisma/client` ^6.17.1 - Database access

## Migration Guide

### For Existing Endpoints
No changes required. The existing `GET /v1/availability` endpoint continues to work as before.

### For New Engine-Based Queries
Use the new `GET /v1/availability/slots` endpoint to get:
- Multi-day availability
- Detailed capacity information
- Pacing constraint visibility
- DST-safe slot generation

### Admin Integration
Admin endpoints (shifts, pacing rules, service buffers, blackouts) don't require changes. Updates to these entities will automatically reflect in the next availability query.

## Performance Considerations

1. **Slot Generation**: O(days × shifts × slotsPerShift)
   - For a 7-day query with 2 shifts/day and 32 slots/shift: ~448 slots
   
2. **Occupancy Calculation**: O(slots × (reservations + holds))
   - Use date-based WHERE clauses to minimize fetched records
   
3. **Caching**: Consider caching engine output per (venue, date, partySize)
   - Cache invalidation on: shift updates, pacing rule changes, blackout changes

## Future Enhancements

1. **Capacity Optimization**: Smart table assignment based on party size
2. **Multi-Venue Queries**: Batch queries across multiple venues
3. **Real-Time Updates**: WebSocket notifications for availability changes
4. **Advanced Pacing**: Different limits by time of day or day of week
5. **Holiday Handling**: Special rules for holidays vs regular days

## Acceptance Criteria

- ✅ GET /v1/availability returns stable slots around DST transitions
- ✅ Admin changes to shifts/pacing/buffers reflect in next availability call
- ✅ Engine uses timezone-aware arithmetic (no naive UTC math)
- ✅ Tests cover spring forward and fall back scenarios
- ✅ Build and typecheck pass with 0 errors
- ✅ Backward compatibility maintained for existing endpoints

## Support

For questions or issues, please contact the platform team or file an issue in the repository.

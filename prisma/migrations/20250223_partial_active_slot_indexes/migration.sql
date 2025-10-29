-- Partial unique indexes to enforce active-slot exclusivity
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_reservation_active_slot"
  ON "Reservation" ("venueId", "tableId", "slotLocalDate", "slotLocalTime")
  WHERE "status" IN ('PENDING', 'CONFIRMED', 'SEATED');

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_hold_active_slot"
  ON "Hold" ("venueId", "tableId", "slotLocalDate", "slotLocalTime")
  WHERE "status" = 'HELD';

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_hold_tableless_active_slot"
  ON "Hold" ("venueId", "slotLocalDate", "slotLocalTime")
  WHERE "tableId" IS NULL AND "status" = 'HELD';

-- Ensure slot-level uniqueness and supporting indexes
ALTER TABLE "Reservation"
  DROP CONSTRAINT IF EXISTS "reservation_slot_unique";

ALTER TABLE "Hold"
  DROP CONSTRAINT IF EXISTS "hold_slot_unique";

DROP INDEX IF EXISTS "Reservation_slotStartUtc_idx";
DROP INDEX IF EXISTS "Reservation_venueId_slotLocalDate_slotLocalTime_idx";
DROP INDEX IF EXISTS "Reservation_venueId_tableId_slotLocalDate_slotLocalTime_idx";
DROP INDEX IF EXISTS "Hold_slotStartUtc_idx";
DROP INDEX IF EXISTS "Hold_venueId_slotLocalDate_slotLocalTime_idx";
DROP INDEX IF EXISTS "Hold_venueId_slotLocalDate_slotLocalTime_tableId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_reservation_venue_table_slot"
  ON "Reservation" ("venueId", "tableId", "slotLocalDate", "slotLocalTime");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_hold_venue_table_slot"
  ON "Hold" ("venueId", "tableId", "slotLocalDate", "slotLocalTime");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_hold_venue_slot_table_nullable"
  ON "Hold" ("venueId", "slotLocalDate", "slotLocalTime", "tableId");

CREATE INDEX IF NOT EXISTS "idx_reservation_slot_start_utc"
  ON "Reservation" ("slotStartUtc");

CREATE INDEX IF NOT EXISTS "idx_reservation_venue_date"
  ON "Reservation" ("venueId", "slotLocalDate");

CREATE INDEX IF NOT EXISTS "idx_hold_slot_start_utc"
  ON "Hold" ("slotStartUtc");

CREATE INDEX IF NOT EXISTS "idx_hold_venue_date"
  ON "Hold" ("venueId", "slotLocalDate");

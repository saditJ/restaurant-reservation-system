-- Ensure slot-level uniqueness for reservations and holds
ALTER TABLE "Reservation"
  ADD CONSTRAINT "reservation_slot_unique" UNIQUE ("venueId", "tableId", "slotLocalDate", "slotLocalTime");

ALTER TABLE "Hold"
  ADD CONSTRAINT "hold_slot_unique" UNIQUE ("venueId", "tableId", "slotLocalDate", "slotLocalTime");

-- Improve lookups by slot start timestamp
CREATE INDEX IF NOT EXISTS "Reservation_slotStartUtc_idx" ON "Reservation"("slotStartUtc");
CREATE INDEX IF NOT EXISTS "Hold_slotStartUtc_idx" ON "Hold"("slotStartUtc");

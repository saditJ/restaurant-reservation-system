-- Add join grouping metadata and multi-table seating support
ALTER TABLE "Table"
  ADD COLUMN "joinGroupId" TEXT,
  ADD COLUMN "zone" TEXT;

CREATE INDEX IF NOT EXISTS "Table_venueId_zone_idx" ON "Table" ("venueId", "zone");

ALTER TABLE "Reservation"
  DROP CONSTRAINT IF EXISTS "reservation_slot_unique";

CREATE TABLE "ReservationTableAssignment" (
  "reservationId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "assignedOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReservationTableAssignment_pkey" PRIMARY KEY ("reservationId", "tableId")
);

CREATE INDEX "ReservationTableAssignment_tableId_idx" ON "ReservationTableAssignment" ("tableId");

ALTER TABLE "ReservationTableAssignment"
  ADD CONSTRAINT "ReservationTableAssignment_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReservationTableAssignment"
  ADD CONSTRAINT "ReservationTableAssignment_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

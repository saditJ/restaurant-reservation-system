-- Align database with Prisma schema for shift/availability structures
DROP INDEX IF EXISTS "WebhookDelivery_reservationId_idx";

ALTER TABLE "NotificationOutbox"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ReservationTableAssignment"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "Shift" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startLocalTime" TEXT NOT NULL,
  "endLocalTime" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AvailabilityRule" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "minPartySize" INTEGER NOT NULL,
  "maxPartySize" INTEGER NOT NULL,
  "slotLengthMinutes" INTEGER NOT NULL,
  "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Blackout" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Blackout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Shift_venueId_dayOfWeek_idx"
  ON "Shift" ("venueId", "dayOfWeek");

CREATE INDEX IF NOT EXISTS "AvailabilityRule_venueId_minPartySize_maxPartySize_idx"
  ON "AvailabilityRule" ("venueId", "minPartySize", "maxPartySize");

CREATE INDEX IF NOT EXISTS "Blackout_venueId_startDate_endDate_idx"
  ON "Blackout" ("venueId", "startDate", "endDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Shift_venueId_fkey'
  ) THEN
    ALTER TABLE "Shift"
      ADD CONSTRAINT "Shift_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AvailabilityRule_venueId_fkey'
  ) THEN
    ALTER TABLE "AvailabilityRule"
      ADD CONSTRAINT "AvailabilityRule_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Blackout_venueId_fkey'
  ) THEN
    ALTER TABLE "Blackout"
      ADD CONSTRAINT "Blackout_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

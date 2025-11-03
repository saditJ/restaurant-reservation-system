-- Update shift scheduling structure to policy-based schema
DROP INDEX IF EXISTS "Shift_venueId_dayOfWeek_idx";

ALTER TABLE "Shift"
  DROP COLUMN IF EXISTS "dayOfWeek",
  DROP COLUMN IF EXISTS "startLocalTime",
  DROP COLUMN IF EXISTS "endLocalTime",
  ADD COLUMN IF NOT EXISTS "dow" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "startsAtLocal" TIME NOT NULL DEFAULT '00:00:00',
  ADD COLUMN IF NOT EXISTS "endsAtLocal" TIME NOT NULL DEFAULT '00:00:00',
  ADD COLUMN IF NOT EXISTS "capacitySeats" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "capacityCovers" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Shift"
  ALTER COLUMN "dow" DROP DEFAULT,
  ALTER COLUMN "startsAtLocal" DROP DEFAULT,
  ALTER COLUMN "endsAtLocal" DROP DEFAULT,
  ALTER COLUMN "capacitySeats" DROP DEFAULT,
  ALTER COLUMN "capacityCovers" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "Shift_venueId_dow_idx" ON "Shift"("venueId", "dow");

-- Replace blackout table with date-based blackout policy
DROP INDEX IF EXISTS "Blackout_venueId_startDate_endDate_idx";
DROP TABLE IF EXISTS "Blackout";

CREATE TABLE IF NOT EXISTS "PacingRule" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "windowMinutes" INTEGER NOT NULL,
  "maxReservations" INTEGER,
  "maxCovers" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PacingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlackoutDate" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlackoutDate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceBuffer" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "beforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "afterMinutes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceBuffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceBuffer_venueId_key" ON "ServiceBuffer"("venueId");
CREATE INDEX IF NOT EXISTS "BlackoutDate_venueId_date_idx" ON "BlackoutDate"("venueId", "date");

ALTER TABLE "PacingRule"
  ADD CONSTRAINT IF NOT EXISTS "PacingRule_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlackoutDate"
  ADD CONSTRAINT IF NOT EXISTS "BlackoutDate_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceBuffer"
  ADD CONSTRAINT IF NOT EXISTS "ServiceBuffer_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

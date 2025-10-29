-- Alter Venue table to replace legacy JSON blobs with structured fields
ALTER TABLE "Venue"
  ADD COLUMN "hours" JSONB,
  ADD COLUMN "turnTimeMin" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "holdTtlMin" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "defaultDurationMin" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "cancellationWindowMin" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "guestCanModifyUntilMin" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "noShowFeePolicy" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pacingPerQuarterHour" INTEGER NOT NULL DEFAULT 4;

-- Carry over existing opening hours JSON if present
UPDATE "Venue"
SET "hours" = "openingHours"
WHERE "openingHours" IS NOT NULL;

-- Extract structured policy values where possible
UPDATE "Venue"
SET
  "turnTimeMin" = COALESCE(NULLIF(TRIM("policies"->>'turnTimeMinutes'), '')::INTEGER, "turnTimeMin"),
  "holdTtlMin" = COALESCE(NULLIF(TRIM("policies"->>'holdTtlMinutes'), '')::INTEGER, "holdTtlMin"),
  "defaultDurationMin" = COALESCE(NULLIF(TRIM("policies"->>'defaultDurationMinutes'), '')::INTEGER, "defaultDurationMin"),
  "cancellationWindowMin" = COALESCE(NULLIF(TRIM("policies"->>'cancellationWindowMinutes'), '')::INTEGER, "cancellationWindowMin"),
  "guestCanModifyUntilMin" = COALESCE(NULLIF(TRIM("policies"->>'guestCanModifyUntilMinutes'), '')::INTEGER, "guestCanModifyUntilMin"),
  "noShowFeePolicy" = COALESCE(NULLIF(TRIM("policies"->>'noShowFeePolicy'), '')::BOOLEAN, "noShowFeePolicy"),
  "pacingPerQuarterHour" = COALESCE(NULLIF(TRIM("policies"->>'pacingPerQuarterHour'), '')::INTEGER, "pacingPerQuarterHour");

-- Fallback guest modify window to cancellation window when not explicitly provided
UPDATE "Venue"
SET "guestCanModifyUntilMin" = "cancellationWindowMin"
WHERE "guestCanModifyUntilMin" IS NULL OR "guestCanModifyUntilMin" = 0;

-- Drop legacy columns
ALTER TABLE "Venue"
  DROP COLUMN "openingHours",
  DROP COLUMN "policies";

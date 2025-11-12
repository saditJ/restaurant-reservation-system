-- Add tenant theme and domain fields
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "theme" JSONB,
  ADD COLUMN IF NOT EXISTS "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

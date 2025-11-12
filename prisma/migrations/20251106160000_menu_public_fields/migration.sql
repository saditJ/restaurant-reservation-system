-- Add tenantId and isPublic to Menu
ALTER TABLE "Menu" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Menu" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Menu" AS m
SET "tenantId" = v."tenantId"
FROM "Venue" v
WHERE v."id" = m."venueId";

ALTER TABLE "Menu"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Menu"
ADD CONSTRAINT "Menu_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Menu_tenantId_idx" ON "Menu"("tenantId");
CREATE INDEX IF NOT EXISTS "Menu_venueId_isPublic_idx" ON "Menu"("venueId", "isPublic");

-- Extend menu item fields
ALTER TABLE "MenuItem" ADD COLUMN "short" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MenuItem" ALTER COLUMN "currency" SET DEFAULT 'ALL';

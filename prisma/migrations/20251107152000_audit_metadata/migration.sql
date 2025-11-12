ALTER TABLE "AuditLog"
  ADD COLUMN "route" TEXT,
  ADD COLUMN "method" TEXT,
  ADD COLUMN "statusCode" INTEGER,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "tenantId" TEXT;

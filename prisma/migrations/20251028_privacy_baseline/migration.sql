-- Privacy baseline migration
ALTER TABLE "Reservation"
  ADD COLUMN "guestPhoneSearch" TEXT,
  ADD COLUMN "guestPhoneLast4" TEXT,
  ADD COLUMN "guestEmailSearch" TEXT,
  ADD COLUMN "piiKeyVersion" TEXT,
  ADD COLUMN "piiAnonymizedAt" TIMESTAMP(3),
  ADD COLUMN "piiAnonymizedReason" TEXT,
  ADD COLUMN "piiAnonymizedToken" TEXT;

CREATE INDEX "idx_reservation_pii_anonymized_at"
  ON "Reservation"("piiAnonymizedAt");

CREATE INDEX "idx_reservation_guest_email_search"
  ON "Reservation"("guestEmailSearch");

CREATE INDEX "idx_reservation_guest_phone_search"
  ON "Reservation"("guestPhoneSearch");

CREATE INDEX "idx_reservation_guest_phone_last4"
  ON "Reservation"("guestPhoneLast4");

ALTER TABLE "Venue"
  ADD COLUMN "retainPersonalDataDays" INTEGER NOT NULL DEFAULT 365;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_audit_resource_created_at"
  ON "AuditLog"("resource", "createdAt");

CREATE INDEX "idx_audit_created_at"
  ON "AuditLog"("createdAt");

CREATE INDEX "idx_audit_action"
  ON "AuditLog"("action");

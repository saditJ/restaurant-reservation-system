-- AlterTable
ALTER TABLE "Venue"
ADD COLUMN "reminderHoursBefore" INTEGER;

ALTER TABLE "Reservation"
ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "idx_reservation_reminder_window"
ON "Reservation"("status", "reminderSentAt", "slotStartUtc");

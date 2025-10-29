-- CreateIndex
CREATE INDEX "Reservation_venueId_slotLocalDate_slotLocalTime_idx" ON "Reservation"("venueId", "slotLocalDate", "slotLocalTime");

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailEnc" TEXT NOT NULL,
    "phoneEnc" TEXT,
    "partySize" INTEGER NOT NULL,
    "desiredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "offerCode" TEXT,
    "holdId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_offerCode_key" ON "Waitlist"("offerCode");
CREATE UNIQUE INDEX "Waitlist_holdId_key" ON "Waitlist"("holdId");
CREATE INDEX "idx_waitlist_venue_status" ON "Waitlist"("venueId", "status");
CREATE INDEX "idx_waitlist_venue_desired_at" ON "Waitlist"("venueId", "desiredAt");

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

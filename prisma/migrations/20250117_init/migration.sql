-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('HELD', 'CONSUMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Tirane',
    "openingHours" JSONB,
    "policies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "area" TEXT,
    "x" INTEGER,
    "y" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT,
    "code" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "partySize" INTEGER NOT NULL,
    "slotLocalDate" TEXT NOT NULL,
    "slotLocalTime" TEXT NOT NULL,
    "slotStartUtc" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 120,
    "notes" TEXT,
    "channel" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hold" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT,
    "reservationId" TEXT,
    "status" "HoldStatus" NOT NULL DEFAULT 'HELD',
    "partySize" INTEGER NOT NULL,
    "slotLocalDate" TEXT NOT NULL,
    "slotLocalTime" TEXT NOT NULL,
    "slotStartUtc" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Table_venueId_capacity_idx" ON "Table"("venueId", "capacity");

-- CreateIndex
CREATE UNIQUE INDEX "Table_venueId_label_key" ON "Table"("venueId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_code_key" ON "Reservation"("code");

-- CreateIndex
CREATE INDEX "Reservation_venueId_slotLocalDate_slotLocalTime_idx" ON "Reservation"("venueId", "slotLocalDate", "slotLocalTime");

-- CreateIndex
CREATE INDEX "Reservation_venueId_slotStartUtc_idx" ON "Reservation"("venueId", "slotStartUtc");

-- CreateIndex
CREATE INDEX "Reservation_venueId_tableId_slotLocalDate_slotLocalTime_idx" ON "Reservation"("venueId", "tableId", "slotLocalDate", "slotLocalTime");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Hold_reservationId_key" ON "Hold"("reservationId");

-- CreateIndex
CREATE INDEX "Hold_venueId_slotLocalDate_slotLocalTime_tableId_idx" ON "Hold"("venueId", "slotLocalDate", "slotLocalTime", "tableId");

-- CreateIndex
CREATE INDEX "Hold_venueId_slotStartUtc_idx" ON "Hold"("venueId", "slotStartUtc");

-- CreateIndex
CREATE INDEX "Hold_status_expiresAt_idx" ON "Hold"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

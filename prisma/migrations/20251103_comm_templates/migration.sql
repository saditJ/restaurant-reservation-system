-- CreateEnum
CREATE TYPE "CommTemplateKind" AS ENUM ('CONFIRM', 'REMINDER', 'CANCELLED', 'OFFER');

-- CreateTable
CREATE TABLE "CommTemplate" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "CommTemplateKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommTemplate_venueId_kind_key" ON "CommTemplate"("venueId", "kind");

-- AddForeignKey
ALTER TABLE "CommTemplate"
ADD CONSTRAINT "CommTemplate_venueId_fkey"
FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "monthlyCap" INTEGER NOT NULL DEFAULT 500000,
ADD COLUMN     "tokenPreview" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "city" TEXT,
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "WebhookDelivery" ALTER COLUMN "failedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WebhookEndpoint" ALTER COLUMN "secret" DROP DEFAULT,
ALTER COLUMN "secretCreatedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "secretRotatedAt" SET DATA TYPE TIMESTAMP(3);

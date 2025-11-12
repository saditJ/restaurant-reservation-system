-- Add per-endpoint secret metadata and subscription events
ALTER TABLE "WebhookEndpoint"
  ADD COLUMN "events" "WebhookEvent"[] NOT NULL DEFAULT ARRAY[]::"WebhookEvent"[],
  ADD COLUMN "secret" TEXT NOT NULL DEFAULT (
    md5(random()::text || clock_timestamp()::text) ||
    md5(clock_timestamp()::text || random()::text)
  ),
  ADD COLUMN "secretCreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN "secretRotatedAt" TIMESTAMPTZ;

-- Ensure existing endpoints subscribe to all events for backward compatibility
UPDATE "WebhookEndpoint"
SET "events" = ARRAY[
  'RESERVATION_CREATED'::"WebhookEvent",
  'RESERVATION_UPDATED'::"WebhookEvent",
  'RESERVATION_CANCELLED'::"WebhookEvent",
  'RESERVATION_SEATED'::"WebhookEvent",
  'RESERVATION_COMPLETED'::"WebhookEvent"
]
WHERE COALESCE(array_length("events", 1), 0) = 0;

-- Add failure metadata for deliveries
ALTER TABLE "WebhookDelivery"
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "failedAt" TIMESTAMPTZ;

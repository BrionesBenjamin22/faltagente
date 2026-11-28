ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WAITLIST_OFFER';

ALTER TABLE "Notification"
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hiddenAt" TIMESTAMPTZ(3);

CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "PushDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'RETRY', 'INVALID');

CREATE TABLE "NotificationJob" (
  "id" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "eventKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leasedAt" TIMESTAMPTZ(3),
  "leaseOwner" TEXT,
  "completedAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationJob_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NotificationJob_eventKey_key" ON "NotificationJob"("eventKey");
CREATE INDEX "NotificationJob_status_availableAt_leasedAt_idx"
  ON "NotificationJob"("status", "availableAt", "leasedAt");

CREATE TABLE "PushSubscription" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_active_idx" ON "PushSubscription"("userId", "active");

CREATE TABLE "PushDelivery" (
  "id" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "status" "PushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDelivery_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "NotificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PushDelivery_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PushDelivery_jobId_subscriptionId_key"
  ON "PushDelivery"("jobId", "subscriptionId");
CREATE INDEX "PushDelivery_status_nextAttemptAt_idx"
  ON "PushDelivery"("status", "nextAttemptAt");

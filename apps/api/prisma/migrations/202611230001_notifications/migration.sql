CREATE TYPE "NotificationType" AS ENUM (
  'MATCH_JOINED',
  'MATCH_LEFT',
  'MATCH_COMPLETED',
  'MATCH_REMINDER',
  'MATCH_CANCELLED',
  'MATCH_UPDATED',
  'RESERVATION_CONFIRMED',
  'PLAYER_REMOVED',
  'EMAIL_PENDING',
  'EMAIL_VERIFIED',
  'SESSION_SECURITY',
  'APP_NEWS'
);

CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "detail" TEXT,
  "relatedMatchId" UUID,
  "actorUserId" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "dedupeKey" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_relatedMatchId_fkey" FOREIGN KEY ("relatedMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX "Notification_relatedMatchId_idx" ON "Notification"("relatedMatchId");

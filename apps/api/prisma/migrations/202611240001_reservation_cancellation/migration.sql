CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
ALTER TABLE "Reservation"
  ADD COLUMN "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3),
  ADD COLUMN "cancellationReason" VARCHAR(500),
  ADD CONSTRAINT "Reservation_cancellation_state" CHECK (
    ("status" = 'CONFIRMED' AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
  );
DROP INDEX "Reservation_userId_matchId_key";
CREATE UNIQUE INDEX "Reservation_confirmed_userId_matchId_key" ON "Reservation"("userId", "matchId") WHERE "status" = 'CONFIRMED';
CREATE INDEX "Reservation_userId_matchId_createdAt_id_idx" ON "Reservation"("userId", "matchId", "createdAt", "id");

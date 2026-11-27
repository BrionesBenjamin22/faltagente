CREATE TYPE "ReservationCancellationSource" AS ENUM ('USER', 'MATCH');
ALTER TABLE "Reservation" ADD COLUMN "cancellationSource" "ReservationCancellationSource";
UPDATE "Reservation" SET "cancellationSource" = 'USER' WHERE "status" = 'CANCELLED';
ALTER TABLE "Reservation" DROP CONSTRAINT "Reservation_cancellation_state";
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_cancellation_state" CHECK (
  ("status" = 'CONFIRMED' AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL AND "cancellationSource" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancellationSource" IS NOT NULL
      AND ("cancellationSource" = 'USER' OR "cancellationReason" IS NULL))
);

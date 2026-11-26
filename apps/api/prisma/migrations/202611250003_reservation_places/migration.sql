BEGIN;
ALTER TYPE "ReservationCancellationSource" ADD VALUE 'ORGANIZER';
ALTER TABLE "Reservation" ADD COLUMN "originalPlaces" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "Reservation" SET "originalPlaces" = "places";
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_quantities_check" CHECK ("places" > 0 AND "originalPlaces" >= "places" AND "version" > 0);
ALTER TABLE "Reservation" DROP CONSTRAINT "Reservation_cancellation_state";
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_cancellation_state" CHECK (
 ("status" = 'CONFIRMED' AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL AND "cancellationSource" IS NULL)
 OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancellationSource" IS NOT NULL
     AND ("cancellationSource"::text IN ('USER', 'ORGANIZER') OR "cancellationReason" IS NULL))
);
CREATE TABLE "ReservationCancellation" (
 "id" UUID NOT NULL PRIMARY KEY, "reservationId" UUID NOT NULL REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "previousPlaces" INTEGER NOT NULL, "remainingPlaces" INTEGER NOT NULL,
 "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "source" "ReservationCancellationSource" NOT NULL, "reason" VARCHAR(500),
 CONSTRAINT "ReservationCancellation_quantities_check" CHECK ("previousPlaces" > "remainingPlaces" AND "remainingPlaces" >= 0)
);
CREATE INDEX "ReservationCancellation_reservationId_occurredAt_id_idx" ON "ReservationCancellation"("reservationId", "occurredAt", "id");
COMMIT;

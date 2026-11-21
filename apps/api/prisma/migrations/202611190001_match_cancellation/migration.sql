-- Preserve unknown historical cancellation audit as NULL.
ALTER TABLE "Match" ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);
ALTER TABLE "Match" ADD COLUMN "cancellationReason" VARCHAR(500);

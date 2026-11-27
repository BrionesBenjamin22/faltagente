-- CreateEnum
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('WAITING', 'OFFERED', 'COMPLETED', 'LEFT', 'EXPIRED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "WaitlistOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'INVALIDATED');

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "places" INTEGER NOT NULL,
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistOffer" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "places" INTEGER NOT NULL,
    "status" "WaitlistOfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "reservationId" UUID,

    CONSTRAINT "WaitlistOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEvent" (
    "sequence" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "offerId" UUID,
    "reason" TEXT,
    "places" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "WaitlistEvent_pkey" PRIMARY KEY ("sequence")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_matchId_status_places_createdAt_id_idx" ON "WaitlistEntry"("matchId", "status", "places", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WaitlistEntry_userId_status_createdAt_id_idx" ON "WaitlistEntry"("userId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistOffer_entryId_key" ON "WaitlistOffer"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistOffer_reservationId_key" ON "WaitlistOffer"("reservationId");

-- CreateIndex
CREATE INDEX "WaitlistOffer_status_expiresAt_id_idx" ON "WaitlistOffer"("status", "expiresAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEvent_id_key" ON "WaitlistEvent"("id");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "WaitlistEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "WaitlistEntry_active_user_match" ON "WaitlistEntry"("userId", "matchId") WHERE "status" IN ('WAITING', 'OFFERED');
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_places_positive" CHECK ("places" > 0);
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_places_positive" CHECK ("places" > 0);
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_resolution_valid" CHECK (("status" = 'PENDING' AND "resolvedAt" IS NULL AND "reservationId" IS NULL) OR ("status" = 'ACCEPTED' AND "resolvedAt" IS NOT NULL AND "reservationId" IS NOT NULL) OR ("status" NOT IN ('PENDING', 'ACCEPTED') AND "resolvedAt" IS NOT NULL AND "reservationId" IS NULL));
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

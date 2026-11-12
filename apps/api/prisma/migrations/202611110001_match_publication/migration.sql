-- Capacity cannot be reconstructed from player participations (a reservation may
-- represent several places). Stop instead of guessing if integration data exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Participation" WHERE "role" = 'PLAYER' AND "active" = true) THEN
    RAISE EXCEPTION 'Match capacity backfill requires review of active player reservations';
  END IF;
END $$;
ALTER TABLE "Match" ADD COLUMN "totalPlaces" INTEGER;
UPDATE "Match" SET "totalPlaces" = "availablePlaces";
ALTER TABLE "Match" ALTER COLUMN "totalPlaces" SET NOT NULL;
ALTER TABLE "Match" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Match" ADD CONSTRAINT "Match_capacity_valid" CHECK ("totalPlaces" >= 0 AND "availablePlaces" <= "totalPlaces");
ALTER TABLE "Match" ADD CONSTRAINT "Match_version_positive" CHECK ("version" > 0);
CREATE INDEX "Match_organizerId_startsAt_id_idx" ON "Match"("organizerId", "startsAt", "id");
CREATE TABLE "MatchChange" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "event" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  CONSTRAINT "MatchChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchChange_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MatchChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MatchChange_matchId_occurredAt_id_idx" ON "MatchChange"("matchId", "occurredAt", "id");

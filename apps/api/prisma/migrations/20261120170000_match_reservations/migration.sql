CREATE TABLE "Reservation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "places" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reservation_places_positive" CHECK ("places" > 0),
  CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Reservation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Reservation_userId_matchId_key" ON "Reservation"("userId", "matchId");
CREATE INDEX "Reservation_matchId_idx" ON "Reservation"("matchId");

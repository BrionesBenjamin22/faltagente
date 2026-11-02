-- Preserve existing Match rows and their timestamps while replacing the legacy format.
BEGIN;

CREATE TABLE "Sport" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SportFormat" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SportFormat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");
CREATE INDEX "Sport_active_name_idx" ON "Sport"("active", "name");
CREATE UNIQUE INDEX "SportFormat_sportId_slug_key" ON "SportFormat"("sportId", "slug");
CREATE UNIQUE INDEX "SportFormat_id_sportId_key" ON "SportFormat"("id", "sportId");
CREATE INDEX "SportFormat_sportId_active_name_idx" ON "SportFormat"("sportId", "active", "name");
ALTER TABLE "SportFormat" ADD CONSTRAINT "SportFormat_sportId_fkey"
    FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO "Sport" ("id", "name", "slug", "updatedAt") VALUES
    (gen_random_uuid(), 'Fútbol', 'futbol', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Pádel', 'padel', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Básquet', 'basquet', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Vóley', 'voley', CURRENT_TIMESTAMP);
INSERT INTO "SportFormat" ("id", "sportId", "name", "slug", "updatedAt")
SELECT gen_random_uuid(), sport."id", format."name", format."slug", CURRENT_TIMESTAMP
FROM (VALUES
    ('futbol', 'Fútbol 5', 'futbol-5'),
    ('futbol', 'Fútbol 6', 'futbol-6'),
    ('futbol', 'Fútbol 7', 'futbol-7'),
    ('basquet', '3x3', '3x3'),
    ('basquet', '5x5', '5x5'),
    ('padel', 'Dobles', 'dobles')
) AS format("sportSlug", "name", "slug")
JOIN "Sport" sport ON sport."slug" = format."sportSlug";

ALTER TABLE "Match" ADD COLUMN "sportId" UUID, ADD COLUMN "sportFormatId" UUID;
UPDATE "Match" match
SET "sportId" = sport."id", "sportFormatId" = format."id"
FROM "Sport" sport, "SportFormat" format
WHERE sport."slug" = 'futbol'
  AND format."sportId" = sport."id"
  AND format."slug" = CASE match."footballType"::text
      WHEN 'FIVE' THEN 'futbol-5'
      WHEN 'SIX' THEN 'futbol-6'
      WHEN 'SEVEN' THEN 'futbol-7'
  END;

-- Fail atomically instead of dropping the source column if any mapping is missing.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "Match" WHERE "sportId" IS NULL OR "sportFormatId" IS NULL) THEN
        RAISE EXCEPTION 'Cannot migrate Match: legacy football mapping is incomplete';
    END IF;
END $$;

ALTER TABLE "Match" ALTER COLUMN "sportId" SET NOT NULL;
ALTER TABLE "Match" ADD CONSTRAINT "Match_sportId_fkey"
    FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- MATCH SIMPLE permits a NULL format, but rejects a format from another sport.
ALTER TABLE "Match" ADD CONSTRAINT "Match_sportFormatId_sportId_fkey"
    FOREIGN KEY ("sportFormatId", "sportId") REFERENCES "SportFormat"("id", "sportId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "Match_sportId_idx" ON "Match"("sportId");
CREATE INDEX "Match_sportFormatId_sportId_idx" ON "Match"("sportFormatId", "sportId");
ALTER TABLE "Match" DROP COLUMN "footballType";
DROP TYPE "FootballType";

COMMIT;

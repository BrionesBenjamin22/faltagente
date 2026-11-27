import { isolatedDatabaseUrl } from './isolated-database.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

describe('legacy football migration on isolated PostgreSQL schema', () => {
  // Seven Prisma migration processes and two seed runs need startup time on Windows.
  it(
    'maps FIVE/SIX/SEVEN without changing Match data or participation constraints',
    { timeout: 180_000 },
    async () => {
      const url = isolatedDatabaseUrl(process.env.DATABASE_URL);
      const schema = `mvp01_${randomUUID().replaceAll('-', '')}`;
      url.searchParams.set('schema', schema);
      const db = new PrismaClient({
        datasources: { db: { url: url.toString() } },
      });
      const require = createRequire(import.meta.url);
      const prismaCli = require.resolve('prisma/build/index.js');
      function applyMigration(name: string) {
        execFileSync(
          process.execPath,
          [
            prismaCli,
            'db',
            'execute',
            '--url',
            url.toString(),
            '--file',
            resolve('prisma/migrations', name, 'migration.sql'),
          ],
          { stdio: 'pipe', timeout: 30_000 },
        );
      }
      // Identifiers originate only from randomUUID, never from untrusted input.
      try {
        await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        applyMigration('202610060001_vertical_slice');
        applyMigration('202610060002_domain_constraints');
        applyMigration('202610070001_profile_history');
        const userId = randomUUID();
        const locationId = randomUUID();
        await db.$executeRaw`INSERT INTO "Location" ("id", "name", "type") VALUES (${locationId}::uuid, 'Migration location', 'LOCALIDAD')`;
        await db.$executeRaw`INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES (${userId}::uuid, 'Migration organizer', 'migration@example.test', '2026-09-01T12:34:56.789Z')`;
        const ids: string[] = [];
        // These are deliberately legacy fixtures; the runtime no longer accepts this enum.
        for (const [index, legacy] of ['FIVE', 'SIX', 'SEVEN'].entries()) {
          const matchId = randomUUID();
          ids.push(matchId);
          await db.$executeRaw`
          INSERT INTO "Match" ("id", "seedKey", "organizerId", "locationId", "footballType", "startsAt", "venueName", "address", "pricePerPerson", "availablePlaces", "description", "status", "createdAt", "updatedAt")
          VALUES (${matchId}::uuid, ${`legacy-${index}`}, ${userId}::uuid, ${locationId}::uuid, ${legacy}::"FootballType", '2026-11-03T01:30:00Z', ${`Legacy venue ${index}`}, 'Address preserved', 1234.56, ${index}, ${index === 1 ? null : 'Description preserved'}, ${['OPEN', 'CLOSED', 'CANCELLED'][index]}::"MatchStatus", '2026-09-01T12:34:56.789Z', '2026-10-01T01:02:03.456Z')`;
        }
        await db.$executeRaw`INSERT INTO "Participation" ("id", "userId", "matchId", "role", "localDate") VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${ids[0]}::uuid, 'ORGANIZER', '2026-11-02')`;
        const before = await db.$queryRaw<
          { snapshot: object }[]
        >`SELECT to_jsonb(m) - 'footballType' AS snapshot FROM "Match" m ORDER BY "id"`;
        const participationBefore =
          await db.$queryRaw`SELECT to_jsonb(p) AS snapshot FROM "Participation" p ORDER BY "id"`;

        applyMigration('202611010001_multisport_domain');

        const after = await db.$queryRaw<
          { snapshot: object }[]
        >`SELECT to_jsonb(m) - 'sportId' - 'sportFormatId' AS snapshot FROM "Match" m ORDER BY "id"`;
        expect(after).toEqual(before);
        expect(
          await db.$queryRaw`SELECT to_jsonb(p) AS snapshot FROM "Participation" p ORDER BY "id"`,
        ).toEqual(participationBefore);
        // New capacity migration must stop when reservation occupancy cannot be
        // reconstructed, then preserve all existing fields in the supported case.
        const playerId = randomUUID();
        await db.$executeRaw`INSERT INTO "Participation" ("id", "userId", "matchId", "role", "localDate") VALUES (${playerId}::uuid, ${userId}::uuid, ${ids[1]}::uuid, 'PLAYER', '2026-11-03')`;
        expect(() =>
          applyMigration('202611110001_match_publication'),
        ).toThrow();
        await db.$executeRaw`DELETE FROM "Participation" WHERE "id" = ${playerId}::uuid`;
        const capacityBefore =
          await db.$queryRaw`SELECT to_jsonb(m) AS snapshot FROM "Match" m ORDER BY "id"`;
        applyMigration('202611110001_match_publication');
        expect(
          await db.$queryRaw`SELECT to_jsonb(m) - 'totalPlaces' - 'version' AS snapshot FROM "Match" m ORDER BY "id"`,
        ).toEqual(capacityBefore);
        const capacities = await db.$queryRaw<
          { availablePlaces: number; totalPlaces: number; version: number }[]
        >`SELECT "availablePlaces", "totalPlaces", "version" FROM "Match"`;
        expect(
          capacities.every(
            (match) =>
              match.totalPlaces === match.availablePlaces &&
              match.version === 1,
          ),
        ).toBe(true);
        const cancellationBefore =
          await db.$queryRaw`SELECT to_jsonb(m) AS snapshot FROM "Match" m ORDER BY "id"`;
        applyMigration('202611190001_match_cancellation');
        expect(
          await db.$queryRaw`SELECT to_jsonb(m) - 'cancelledAt' - 'cancellationReason' AS snapshot FROM "Match" m ORDER BY "id"`,
        ).toEqual(cancellationBefore);
        expect(
          await db.$queryRaw`SELECT "id" FROM "Match" WHERE "cancelledAt" IS NOT NULL OR "cancellationReason" IS NOT NULL`,
        ).toEqual([]);
        applyMigration('20261120170000_match_reservations');
        const reservationId = randomUUID();
        await db.$executeRaw`INSERT INTO "Reservation" ("id", "userId", "matchId", "places", "createdAt") VALUES (${reservationId}::uuid, ${userId}::uuid, ${ids[0]}::uuid, 2, '2026-10-01T01:02:03.456Z')`;
        const reservationBefore =
          await db.$queryRaw`SELECT to_jsonb(r) AS snapshot FROM "Reservation" r`;
        applyMigration('202611240001_reservation_cancellation');
        expect(
          await db.$queryRaw`SELECT to_jsonb(r) - 'status' - 'cancelledAt' - 'cancellationReason' AS snapshot FROM "Reservation" r`,
        ).toEqual(reservationBefore);
        const oldCancelledId = randomUUID();
        await db.$executeRaw`INSERT INTO "Reservation" ("id", "userId", "matchId", "places", "status", "cancelledAt", "cancellationReason") VALUES (${oldCancelledId}::uuid, ${userId}::uuid, ${ids[0]}::uuid, 1, 'CANCELLED', '2026-10-02T01:02:03.456Z', 'Private legacy reason')`;
        const beforeSource =
          await db.$queryRaw`SELECT to_jsonb(r) AS snapshot FROM "Reservation" r ORDER BY "id"`;
        applyMigration('202611250001_match_reservation_cancellation');
        expect(
          await db.$queryRaw`SELECT to_jsonb(r) - 'cancellationSource' AS snapshot FROM "Reservation" r ORDER BY "id"`,
        ).toEqual(beforeSource);
        applyMigration('202611250002_waitlist');
        await db.$executeRaw`UPDATE "Reservation" SET "places" = 4 WHERE "id" = ${oldCancelledId}::uuid`;
        const singleConfirmedId = randomUUID();
        const singleCancelledId = randomUUID();
        await db.$executeRaw`INSERT INTO "Reservation" ("id", "userId", "matchId", "places") VALUES (${singleConfirmedId}::uuid, ${userId}::uuid, ${ids[1]}::uuid, 1)`;
        await db.$executeRaw`INSERT INTO "Reservation" ("id", "userId", "matchId", "places", "status", "cancelledAt", "cancellationSource") VALUES (${singleCancelledId}::uuid, ${userId}::uuid, ${ids[2]}::uuid, 1, 'CANCELLED', '2026-10-02T01:02:03.456Z', 'USER')`;
        const beforePlaces =
          await db.$queryRaw`SELECT to_jsonb(r) AS snapshot FROM "Reservation" r ORDER BY "id"`;
        const matchBeforePlaces =
          await db.$queryRaw`SELECT to_jsonb(m) AS snapshot FROM "Match" m ORDER BY "id"`;
        const participantsBeforePlaces =
          await db.$queryRaw`SELECT to_jsonb(p) AS snapshot FROM "Participation" p ORDER BY "id"`;
        applyMigration('202611250003_reservation_places');
        expect(
          await db.$queryRaw`SELECT to_jsonb(r) - 'originalPlaces' - 'version' AS snapshot FROM "Reservation" r ORDER BY "id"`,
        ).toEqual(beforePlaces);
        expect(
          await db.$queryRaw`SELECT to_jsonb(m) AS snapshot FROM "Match" m ORDER BY "id"`,
        ).toEqual(matchBeforePlaces);
        expect(
          await db.$queryRaw`SELECT to_jsonb(p) AS snapshot FROM "Participation" p ORDER BY "id"`,
        ).toEqual(participantsBeforePlaces);
        const migratedReservations = await db.reservation.findMany();
        expect(migratedReservations).toHaveLength(4);
        expect(migratedReservations.every(row => row.originalPlaces === row.places && row.version === 1)).toBe(true);
        expect(await db.$queryRaw`SELECT 1 FROM information_schema.tables WHERE table_schema = ${schema} AND table_name IN ('ReservationCompanion', 'ReservationCompanionChange')`).toEqual([]);
        expect(await db.reservationCancellation.count()).toBe(0);
        await db.reservation.deleteMany({ where: { id: { in: [singleConfirmedId, singleCancelledId] } } });
        expect(
          await db.reservation.findUniqueOrThrow({
            where: { id: oldCancelledId },
          }),
        ).toMatchObject({
          cancellationSource: 'USER',
          cancellationReason: 'Private legacy reason',
          cancelledAt: new Date('2026-10-02T01:02:03.456Z'),
        });
        expect(
          await db.reservation.findUniqueOrThrow({
            where: { id: reservationId },
          }),
        ).toMatchObject({ cancellationSource: null });
        await db.reservation.delete({ where: { id: oldCancelledId } });
        expect(
          await db.reservation.findUniqueOrThrow({
            where: { id: reservationId },
          }),
        ).toMatchObject({
          status: 'CONFIRMED',
          cancelledAt: null,
          cancellationReason: null,
        });
        await expect(
          db.reservation.create({
            data: { userId, matchId: ids[0], places: 1 },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
        await db.reservation.update({
          where: { id: reservationId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: 'Preserved history',
            cancellationSource: 'USER',
          },
        });
        const replacement = await db.reservation.create({
          data: { userId, matchId: ids[0], places: 1 },
        });
        await db.reservation.update({
          where: { id: replacement.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationSource: 'MATCH',
          },
        });
        await db.reservation.create({
          data: { userId, matchId: ids[0], places: 1 },
        });
        expect(
          await db.reservation.count({ where: { userId, matchId: ids[0] } }),
        ).toBe(3);
        expect(
          await db.reservation.findUniqueOrThrow({
            where: { id: reservationId },
          }),
        ).toMatchObject({
          status: 'CANCELLED',
          cancellationReason: 'Preserved history',
          places: 2,
        });
        await expect(
          db.reservation.update({
            where: { id: reservationId },
            data: { cancelledAt: null },
          }),
        ).rejects.toThrow();
        await expect(
          db.reservation.update({
            where: { id: reservationId },
            data: { cancellationSource: null },
          }),
        ).rejects.toThrow();
        await expect(
          db.reservation.update({
            where: { id: reservationId },
            data: { cancellationSource: 'MATCH' },
          }),
        ).rejects.toThrow();
        const mapped = await db.match.findMany({
          orderBy: { seedKey: 'asc' },
          include: { sport: true, sportFormat: true },
        });
        expect(
          mapped.map((match) => ({
            id: match.id,
            sport: match.sport.slug,
            format: match.sportFormat?.name,
          })),
        ).toEqual([
          { id: ids[0], sport: 'futbol', format: 'Fútbol 5' },
          { id: ids[1], sport: 'futbol', format: 'Fútbol 6' },
          { id: ids[2], sport: 'futbol', format: 'Fútbol 7' },
        ]);
        expect(await db.sport.count()).toBe(4);
        expect(await db.sportFormat.count()).toBe(6);
        expect(
          await db.sportFormat.count({ where: { sport: { slug: 'voley' } } }),
        ).toBe(0);
        expect(
          await db.$queryRaw`SELECT 1 FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'Match' AND column_name = 'footballType'`,
        ).toEqual([]);
        expect(
          await db.$queryRaw`SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = ${schema} AND t.typname = 'FootballType'`,
        ).toEqual([]);
        await expect(
          db.participation.create({
            data: {
              userId,
              matchId: ids[1],
              role: 'PLAYER',
              localDate: new Date('2026-11-02T00:00:00Z'),
            },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
        await expect(
          db.participation.create({
            data: {
              userId,
              matchId: ids[0],
              role: 'PLAYER',
              localDate: new Date('2026-11-03T00:00:00Z'),
            },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
        await expect(
          db.match.update({
            where: { id: ids[0] },
            data: { availablePlaces: -1 },
          }),
        ).rejects.toThrow();
        await expect(
          db.match.update({
            where: { id: ids[0] },
            data: { pricePerPerson: -1 },
          }),
        ).rejects.toThrow();

        // The seed must reuse migration catalog identities and respect later deactivation.
        const basketball = await db.sport.findUniqueOrThrow({
          where: { slug: 'basquet' },
        });
        await db.sport.update({
          where: { id: basketball.id },
          data: { active: false },
        });
        await db.sportFormat.update({
          where: { id: mapped[0].sportFormatId! },
          data: { active: false },
        });
        const catalogSelect = {
          id: true,
          slug: true,
          active: true,
          formats: {
            select: { id: true, slug: true, active: true },
            orderBy: { slug: 'asc' as const },
          },
        };
        const catalogBefore = await db.sport.findMany({
          select: catalogSelect,
          orderBy: { slug: 'asc' },
        });
        const seed = () =>
          execFileSync(
            process.execPath,
            [
              require.resolve('tsx/cli'),
              resolve('prisma/seed.ts'),
              '--development',
            ],
            {
              stdio: 'pipe',
              timeout: 30_000,
              env: {
                ...process.env,
                DATABASE_URL: url.toString(),
                NODE_ENV: 'development',
              },
            },
          );
        seed();
        const locationsAfterFirstSeed = await db.location.findMany({
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        const demoAfterFirstSeed = await db.match.findMany({
          where: { seedKey: { startsWith: 'demo-match-' } },
          select: { id: true, sportId: true, sportFormatId: true },
          orderBy: { id: 'asc' },
        });
        seed();
        expect(
          await db.sport.findMany({
            select: catalogSelect,
            orderBy: { slug: 'asc' },
          }),
        ).toEqual(catalogBefore);
        expect(
          await db.location.findMany({
            select: { id: true },
            orderBy: { id: 'asc' },
          }),
        ).toEqual(locationsAfterFirstSeed);
        expect(
          await db.match.findMany({
            where: { seedKey: { startsWith: 'demo-match-' } },
            select: { id: true, sportId: true, sportFormatId: true },
            orderBy: { id: 'asc' },
          }),
        ).toEqual(demoAfterFirstSeed);
        expect(demoAfterFirstSeed).toHaveLength(4);
        expect(await db.match.count()).toBe(7);
        expect(
          await db.participation.count({
            where: {
              match: { seedKey: { startsWith: 'demo-match-' } },
              role: 'ORGANIZER',
              active: true,
            },
          }),
        ).toBe(4);
      } finally {
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await db.$disconnect();
      }
    },
  );
});

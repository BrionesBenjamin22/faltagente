import { isolatedDatabaseUrl } from './isolated-database.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

describe('legacy football migration on isolated PostgreSQL schema', () => {
  it('maps FIVE/SIX/SEVEN without changing Match data or participation constraints', { timeout: 90_000 }, async () => {
    const url = isolatedDatabaseUrl(process.env.DATABASE_URL);
    const schema = `mvp01_${randomUUID().replaceAll('-', '')}`;
    url.searchParams.set('schema', schema);
    const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const require = createRequire(import.meta.url);
    const prismaCli = require.resolve('prisma/build/index.js');
    function applyMigration(name: string) {
      execFileSync(process.execPath, [prismaCli, 'db', 'execute', '--url', url.toString(), '--file', resolve('prisma/migrations', name, 'migration.sql')], { stdio: 'pipe', timeout: 30_000 });
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
      const before = await db.$queryRaw<{ snapshot: object }[]>`SELECT to_jsonb(m) - 'footballType' AS snapshot FROM "Match" m ORDER BY "id"`;
      const participationBefore = await db.$queryRaw`SELECT to_jsonb(p) AS snapshot FROM "Participation" p ORDER BY "id"`;

      applyMigration('202611010001_multisport_domain');

      const after = await db.$queryRaw<{ snapshot: object }[]>`SELECT to_jsonb(m) - 'sportId' - 'sportFormatId' AS snapshot FROM "Match" m ORDER BY "id"`;
      expect(after).toEqual(before);
      expect(await db.$queryRaw`SELECT to_jsonb(p) AS snapshot FROM "Participation" p ORDER BY "id"`).toEqual(participationBefore);
      const mapped = await db.match.findMany({ orderBy: { seedKey: 'asc' }, include: { sport: true, sportFormat: true } });
      expect(mapped.map(match => ({ id: match.id, sport: match.sport.slug, format: match.sportFormat?.name }))).toEqual([
        { id: ids[0], sport: 'futbol', format: 'Fútbol 5' },
        { id: ids[1], sport: 'futbol', format: 'Fútbol 6' },
        { id: ids[2], sport: 'futbol', format: 'Fútbol 7' },
      ]);
      expect(await db.sport.count()).toBe(4);
      expect(await db.sportFormat.count()).toBe(6);
      expect(await db.sportFormat.count({ where: { sport: { slug: 'voley' } } })).toBe(0);
      expect(await db.$queryRaw`SELECT 1 FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'Match' AND column_name = 'footballType'`).toEqual([]);
      expect(await db.$queryRaw`SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = ${schema} AND t.typname = 'FootballType'`).toEqual([]);
      await expect(db.participation.create({ data: { userId, matchId: ids[1], role: 'PLAYER', localDate: new Date('2026-11-02T00:00:00Z') } })).rejects.toMatchObject({ code: 'P2002' });
      await expect(db.participation.create({ data: { userId, matchId: ids[0], role: 'PLAYER', localDate: new Date('2026-11-03T00:00:00Z') } })).rejects.toMatchObject({ code: 'P2002' });
      await expect(db.match.update({ where: { id: ids[0] }, data: { availablePlaces: -1 } })).rejects.toThrow();
      await expect(db.match.update({ where: { id: ids[0] }, data: { pricePerPerson: -1 } })).rejects.toThrow();

      // The seed must reuse migration catalog identities and respect later deactivation.
      const basketball = await db.sport.findUniqueOrThrow({ where: { slug: 'basquet' } });
      await db.sport.update({ where: { id: basketball.id }, data: { active: false } });
      await db.sportFormat.update({ where: { id: mapped[0].sportFormatId! }, data: { active: false } });
      const catalogSelect = { id: true, slug: true, active: true, formats: { select: { id: true, slug: true, active: true }, orderBy: { slug: 'asc' as const } } };
      const catalogBefore = await db.sport.findMany({ select: catalogSelect, orderBy: { slug: 'asc' } });
      const seed = () => execFileSync(process.execPath, [require.resolve('tsx/cli'), resolve('prisma/seed.ts'), '--development'], {
        stdio: 'pipe', timeout: 30_000,
        env: { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'development' },
      });
      seed();
      const locationsAfterFirstSeed = await db.location.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      const demoAfterFirstSeed = await db.match.findMany({ where: { seedKey: { startsWith: 'demo-match-' } }, select: { id: true, sportId: true, sportFormatId: true }, orderBy: { id: 'asc' } });
      seed();
      expect(await db.sport.findMany({ select: catalogSelect, orderBy: { slug: 'asc' } })).toEqual(catalogBefore);
      expect(await db.location.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).toEqual(locationsAfterFirstSeed);
      expect(await db.match.findMany({ where: { seedKey: { startsWith: 'demo-match-' } }, select: { id: true, sportId: true, sportFormatId: true }, orderBy: { id: 'asc' } })).toEqual(demoAfterFirstSeed);
      expect(demoAfterFirstSeed).toHaveLength(4);
      expect(await db.match.count()).toBe(7);
      expect(await db.participation.count({ where: { match: { seedKey: { startsWith: 'demo-match-' } }, role: 'ORGANIZER', active: true } })).toBe(4);
    } finally {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });
});

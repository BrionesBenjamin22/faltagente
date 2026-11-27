import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireFromApi = createRequire(fileURLToPath(new URL('../../apps/api/package.json', import.meta.url)));
const { PrismaClient } = requireFromApi('@prisma/client');
const db = new PrismaClient();

try {
  const result = await db.$transaction(async tx => {
    const [server] = await tx.$queryRaw`SELECT version() AS version, clock_timestamp() AS now`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(17312025, 1)::text`;
    const tables = await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename IN ('Location', 'Sport', 'User', 'Match', '_prisma_migrations')`;
    const existing = new Set(tables.map(row => row.tablename));
    const counts = {};
    for (const [table, model] of [['Location', 'location'], ['Sport', 'sport'], ['User', 'user'], ['Match', 'match']])
      counts[table] = existing.has(table) ? await tx[model].count() : null;
    let migrations = null;
    if (existing.has('_prisma_migrations')) {
      const [row] = await tx.$queryRaw`SELECT count(*)::int AS applied FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      migrations = row.applied;
    }
    return { version: server.version, clock: server.now, transactionLock: 'ok', counts, appliedMigrations: migrations };
  }, { maxWait: 10_000, timeout: 15_000 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  process.stderr.write('Neon database check failed. Check connectivity and migration status; no credentials were printed.\n');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

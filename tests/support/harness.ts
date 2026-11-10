import { isolatedDatabaseUrl } from '../../apps/api/test/isolated-database';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';

export type Mail = { to: string; kind: 'VERIFY' | 'RESET'; token: string };
export const api = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
const webOrigin = new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3000').origin;
const apiPort = Number(new URL(api).port || 80);
const requireApi = createRequire(resolve('apps/api/package.json'));

export function isolatedDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the isolated browser test harness.');
  isolatedDatabaseUrl(process.env.DATABASE_URL);
  return process.env.DATABASE_URL;
}

export function prismaFixture() {
  isolatedDatabase();
  const { PrismaClient } = requireApi('@prisma/client');
  return new PrismaClient();
}

export async function hashFixturePassword(password: string): Promise<string> {
  return requireApi('argon2').hash(password);
}

/** Isolated real discovery data; uses the persisted catalog rather than a fake API. */
export async function discoveryFixtures() {
  const db = prismaFixture();
  const suffix = randomUUID();
  const organizer = await db.user.create({ data: { name: 'Discovery browser fixture', email: `discovery-${suffix}@example.test` } });
  const location = await db.location.findUniqueOrThrow({ where: { seedKey: 'la-plata-tolosa' } });
  const football = await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' }, include: { formats: true } });
  const padel = await db.sport.findUniqueOrThrow({ where: { slug: 'padel' }, include: { formats: true } });
  const voley = await db.sport.findUniqueOrThrow({ where: { slug: 'voley' } });
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const prefix = `Discovery ${suffix.slice(0, 8)}`;
  const common = { organizerId: organizer.id, locationId: location.id, startsAt: new Date(`${day}T18:00:00-03:00`), address: 'Dirección de prueba', pricePerPerson: 4200, availablePlaces: 3 };
  try {
    await db.match.createMany({ data: [
      ...Array.from({ length: 10 }, (_, index) => ({ ...common, sportId: football.id, sportFormatId: football.formats.find((format: { slug: string }) => format.slug === 'futbol-5').id, venueName: `${prefix} Fútbol 5 ${index + 1}` })),
      { ...common, sportId: football.id, sportFormatId: football.formats.find((format: { slug: string }) => format.slug === 'futbol-7').id, venueName: `${prefix} Fútbol 7` },
      { ...common, sportId: padel.id, sportFormatId: padel.formats.find((format: { slug: string }) => format.slug === 'dobles').id, venueName: `${prefix} Pádel` },
      { ...common, sportId: voley.id, venueName: `${prefix} Vóley` },
    ] });
  } catch (error) {
    await db.match.deleteMany({ where: { organizerId: organizer.id } });
    await db.user.delete({ where: { id: organizer.id } });
    await db.$disconnect();
    throw error;
  }
  return { location, football, padel, day, prefix, cleanup: async () => {
    await db.match.deleteMany({ where: { organizerId: organizer.id } });
    await db.user.delete({ where: { id: organizer.id } });
    await db.$disconnect();
  } };
}

export const test = base.extend<object, { mailbox: Mail[] }>({
  mailbox: [async ({}, use) => {
    isolatedDatabase();
    // Docker smoke tests use the actual container API; email-token tests still
    // require the default in-process API with its mocked mailbox.
    if (process.env.E2E_EXTERNAL_API === '1') {
      await use([]);
      return;
    }
    Object.assign(process.env, {
      NODE_ENV: 'development', PORT: String(apiPort), CORS_ORIGINS: webOrigin, FRONTEND_URL: webOrigin,
      JWT_SECRET: 'test-only-jwt-secret-longer-than-32-characters', CSRF_SECRET: 'test-only-csrf-secret-longer-than-32-characters',
    });
    const { Test } = requireApi('@nestjs/testing');
    // Load the built NestJS application so decorator metadata matches production.
    const { AppModule } = requireApi('./dist/app.module.js');
    const { EmailService } = requireApi('./dist/auth/email.service.js');
    const { configureApplication } = requireApi('./dist/configure-app.js');
    const mailbox: Mail[] = [];
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService)
      .useValue({ send: async (to: string, kind: Mail['kind'], token: string) => { mailbox.push({ to, kind, token }); } }).compile();
    const app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(apiPort, '127.0.0.1');
    try { await use(mailbox); } finally { await app.close(); }
  }, { scope: 'worker', auto: true }],
});

export { expect };

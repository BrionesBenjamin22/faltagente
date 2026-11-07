import { isolatedDatabaseUrl } from './isolated-database.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';

describe('public match detail', () => {
  let app: INestApplication;
  let db: PrismaService;
  let locationId: string;
  let organizerId: string;
  let sportId: string;
  let formatId: string;
  let matchId: string;
  let closedMatchId: string;
  let cancelledMatchId: string;
  const startsAt = '2099-11-03T21:30:00.000Z';
  const get = (id: string) => request(app.getHttpServer()).get(`/api/v1/matches/${id}`);

  beforeAll(async () => {
    isolatedDatabaseUrl(process.env.DATABASE_URL);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    const suffix = randomUUID();
    locationId = (await db.location.create({ data: { name: `Detail ${suffix}`, type: 'LOCALIDAD' } })).id;
    organizerId = (await db.user.create({ data: {
      name: 'Martín R.', email: `detail-${suffix}@example.test`,
      passwordHash: 'private-fixture-hash', primaryLocationId: locationId,
      emailVerifiedAt: new Date(),
    } })).id;
    sportId = (await db.sport.create({ data: { name: 'Detail sport', slug: `detail-${suffix}` } })).id;
    formatId = (await db.sportFormat.create({ data: { sportId, name: 'Detail format', slug: 'detail-format' } })).id;
    const base = {
      organizerId, locationId, sportId, sportFormatId: formatId,
      venueName: 'El Galpón', address: '1 y 63', pricePerPerson: '7000.50',
      availablePlaces: 2, startsAt: new Date(startsAt), description: 'Nivel intermedio.',
    };
    matchId = (await db.match.create({ data: base })).id;
    closedMatchId = (await db.match.create({ data: {
      ...base, status: 'CLOSED', sportFormatId: null, availablePlaces: 0, description: null,
    } })).id;
    cancelledMatchId = (await db.match.create({ data: {
      ...base, status: 'CANCELLED', startsAt: new Date('2000-01-01T12:00:00Z'),
    } })).id;
  });

  afterAll(async () => {
    if (db) {
      if (organizerId) {
        await db.match.deleteMany({ where: { organizerId } });
        await db.user.deleteMany({ where: { id: organizerId } });
      }
      if (locationId) await db.location.deleteMany({ where: { id: locationId } });
      if (sportId) {
        await db.sportFormat.deleteMany({ where: { sportId } });
        await db.sport.deleteMany({ where: { id: sportId } });
      }
    }
    await app?.close();
  });

  it('returns a public detail without authentication and only the documented fields', async () => {
    const { body } = await get(matchId).expect(200);
    expect(body).toEqual({
      id: matchId,
      sport: { id: sportId, name: 'Detail sport', slug: expect.any(String) },
      sportFormat: { id: formatId, name: 'Detail format', slug: 'detail-format' },
      startsAt,
      location: { id: locationId, name: expect.any(String) },
      placeName: 'El Galpón', address: '1 y 63', pricePerPerson: '7000.5',
      availablePlaces: 2, description: 'Nivel intermedio.', status: 'OPEN',
      organizer: { id: organizerId, name: 'Martín R.' },
    });
    // Exact shape assertions prevent exposing new private model fields by accident.
    expect(Object.keys(body.organizer).sort()).toEqual(['id', 'name']);
    expect(JSON.stringify(body)).not.toContain('private-fixture-hash');
    expect(JSON.stringify(body)).not.toContain('@example.test');
  });

  it('represents closed matches with nullable format/description and no places', async () => {
    const { body } = await get(closedMatchId).expect(200);
    expect(body).toMatchObject({
      id: closedMatchId, status: 'CLOSED', sport: { id: sportId },
      sportFormat: null, description: null, availablePlaces: 0,
    });
  });

  it('keeps cancelled and past match URLs readable without changing their status', async () => {
    const { body } = await get(cancelledMatchId).expect(200);
    expect(body).toMatchObject({ id: cancelledMatchId, status: 'CANCELLED', startsAt: '2000-01-01T12:00:00.000Z' });
    expect((await db.match.findUniqueOrThrow({ where: { id: cancelledMatchId } })).status).toBe('CANCELLED');
  });

  it('keeps persisted identities readable if catalog entries become inactive', async () => {
    await db.sport.update({ where: { id: sportId }, data: { active: false } });
    await db.sportFormat.update({ where: { id: formatId }, data: { active: false } });
    await db.location.update({ where: { id: locationId }, data: { active: false } });
    const { body } = await get(matchId).expect(200);
    expect(body).toMatchObject({ sport: { id: sportId }, sportFormat: { id: formatId }, location: { id: locationId } });
    expect(body.sport).not.toHaveProperty('active');
    expect(body.location).not.toHaveProperty('active');
  });

  it('returns safe 404 for an unknown UUID', async () => {
    const { body } = await get(randomUUID()).expect(404);
    expect(body).toEqual({ code: 'NOT_FOUND', message: expect.any(String), requestId: expect.any(String) });
  });

  it.each(['bad-id', '123', '00000000-0000-0000-0000-invalid00000'])('rejects malformed id %s with the standard validation error', async id => {
    const { body } = await get(id).expect(400);
    expect(body).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), requestId: expect.any(String) });
  });
});

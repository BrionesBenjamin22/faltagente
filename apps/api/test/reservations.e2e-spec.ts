import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { isolatedDatabaseUrl } from './isolated-database.js';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';
import { EmailService } from '../src/auth/email.service.js';

describe('reservations against real PostgreSQL', { timeout: 30000 }, () => {
  let app: INestApplication;
  let db: PrismaService;
  let locationId: string;
  let sportId: string;
  let organizerId: string;
  const userIds: string[] = [];
  const matchIds: string[] = [];
  const password = 'Reservation test password 123!';
  class Browser {
    cookies = new Map<string, string>();
    csrf = '';
    async send(method: 'get' | 'post', path: string, body?: object, protect = true, origin = 'http://localhost:3000') {
      const op = request(app.getHttpServer())[method](`/api/v1${path}`).set('Origin', origin)
        .set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
      if (method === 'post' && protect) op.set('X-CSRF-Token', this.csrf);
      if (body) op.send(body);
      const res = await op;
      for (const cookie of (res.headers['set-cookie'] as unknown as string[] | undefined) ?? []) {
        const [k, v] = cookie.split(';')[0].split('='); if (v) this.cookies.set(k, v); else this.cookies.delete(k);
      }
      return res;
    }
    async prepare() { this.csrf = (await this.send('get', '/auth/csrf')).body.csrfToken; }
  }
  async function player() {
    const user = await db.user.create({ data: { name: 'Player', email: `reservation-${randomUUID()}@example.test`, passwordHash: await argon2.hash(password), primaryLocationId: locationId } });
    userIds.push(user.id);
    const browser = new Browser(); await browser.prepare();
    expect((await browser.send('post', '/auth/login', { email: user.email, password })).status).toBe(200);
    await browser.prepare(); return { id: user.id, browser };
  }
  async function match(places = 2, startsAt = '2099-11-03T23:00:00Z', status: 'OPEN' | 'CLOSED' | 'CANCELLED' = 'OPEN') {
    const row = await db.match.create({ data: { organizerId, locationId, sportId, availablePlaces: places, totalPlaces: places, startsAt: new Date(startsAt), status, venueName: 'Reservation court', address: '1 y 2', pricePerPerson: 1000 } });
    matchIds.push(row.id); return row.id;
  }
  const path = (id: string) => `/matches/${id}/reservations`;
  beforeAll(async () => {
    isolatedDatabaseUrl(process.env.DATABASE_URL);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: async () => {} }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init(); db = app.get(PrismaService);
    locationId = (await db.location.create({ data: { name: `Reservations ${randomUUID()}`, type: 'LOCALIDAD' } })).id;
    sportId = (await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } })).id;
    organizerId = (await player()).id;
  });
  afterAll(async () => {
    if (db) {
      await db.reservation.deleteMany({ where: { matchId: { in: matchIds } } });
      await db.participation.deleteMany({ where: { userId: { in: userIds } } });
      await db.match.deleteMany({ where: { id: { in: matchIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      if (locationId) await db.location.delete({ where: { id: locationId } });
    }
    await app?.close();
  });
  it('reserves multiple places, creates PLAYER, closes full match and retries idempotently', async () => {
    const p = await player(); const id = await match();
    const empty = await p.browser.send('get', `${path(id)}/me`);
    expect(empty.body).toBeNull(); expect(empty.text).toBe('null');
    const results = await Promise.all([1, 2].map(() => p.browser.send('post', path(id), { places: 2 })));
    expect(results.map(r => r.status)).toEqual([201, 201]); expect(results[0].body).toEqual(results[1].body);
    expect(Object.keys(results[0].body).sort()).toEqual(['createdAt', 'id', 'matchId', 'places']);
    expect((await p.browser.send('get', `${path(id)}/me`)).body).toEqual(results[0].body);
    expect(await db.match.findUnique({ where: { id } })).toMatchObject({ availablePlaces: 0, totalPlaces: 2, status: 'CLOSED' });
    expect(await db.participation.findMany({ where: { userId: p.id, matchId: id } })).toMatchObject([{ role: 'PLAYER', active: true }]);
    expect(await db.reservation.count({ where: { matchId: id } })).toBe(1);
    expect((await p.browser.send('post', path(id), { places: 1 })).body.code).toBe('RESERVATION_ALREADY_EXISTS');
    const other = await player(); expect((await other.browser.send('get', `${path(id)}/me`)).body).toBeNull();
  });
  it('serializes competing users for the last place without overselling', async () => {
    const a = await player(); const b = await player(); const id = await match(1);
    const results = await Promise.all([a, b].map(p => p.browser.send('post', path(id), { places: 1 })));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await db.reservation.count({ where: { matchId: id } })).toBe(1);
    expect((await db.match.findUniqueOrThrow({ where: { id } })).availablePlaces).toBe(0);
  });
  it('enforces local daily uniqueness concurrently across UTC dates, but allows the next local day', async () => {
    const p = await player(); const a = await match(2, '2099-11-03T23:00:00Z'); const b = await match(2, '2099-11-04T01:00:00Z');
    const results = await Promise.all([a, b].map(id => p.browser.send('post', path(id), { places: 1 })));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(results.find(r => r.status === 409)?.body.code).toBe('DAILY_PARTICIPATION_CONFLICT');
    expect(await db.reservation.count({ where: { userId: p.id } })).toBe(1);
    const publication = await p.browser.send('post', '/matches', {
      sportId, locationId, startsAt: '2099-11-04T01:00:00Z',
      placeName: 'Conflicting publication', address: '1 y 2', pricePerPerson: '1000', totalPlaces: 2,
    });
    expect(publication.status).toBe(409);
    expect(publication.body.code).toBe('PARTICIPATION_DATE_CONFLICT');
    expect((await db.match.aggregate({ where: { id: { in: [a, b] } }, _sum: { availablePlaces: true } }))._sum.availablePlaces).toBe(3);
    const nextDay = await match(2, '2099-11-04T04:00:00Z');
    expect((await p.browser.send('post', path(nextDay), { places: 1 })).status).toBe(201);
  });
  it('rejects own match and an organizer participation on the same local day', async () => {
    const p = await player(); const own = await match();
    await db.match.update({ where: { id: own }, data: { organizerId: p.id } });
    await db.participation.create({ data: { userId: p.id, matchId: own, role: 'ORGANIZER', localDate: new Date('2099-11-03') } });
    expect((await p.browser.send('post', path(own), { places: 1 })).body.code).toBe('OWN_MATCH');
    const other = await match(); expect((await p.browser.send('post', path(other), { places: 1 })).body.code).toBe('DAILY_PARTICIPATION_CONFLICT');
  });
  it('validates places, capacity, start, status, identifiers and injected identity without mutation', async () => {
    const p = await player(); const id = await match();
    for (const places of [0, -1, 1.5, '1', 2147483648]) expect((await p.browser.send('post', path(id), { places })).status).toBe(400);
    expect((await p.browser.send('post', path(id), { places: 3 })).body.code).toBe('MATCH_FULL');
    expect((await p.browser.send('post', path(id), { places: 1, userId: organizerId })).status).toBe(400);
    for (const blocked of [await match(2, '2000-01-01T00:00:00Z'), await match(2, undefined, 'CLOSED'), await match(2, undefined, 'CANCELLED')]) {
      expect((await p.browser.send('post', path(blocked), { places: 1 })).body.code).toBe('MATCH_UNAVAILABLE');
    }
    expect((await p.browser.send('post', path(randomUUID()), { places: 1 })).status).toBe(404);
    expect((await p.browser.send('post', path('bad-id'), { places: 1 })).status).toBe(400);
    expect(await db.reservation.count({ where: { userId: p.id } })).toBe(0);
    expect((await db.match.findUniqueOrThrow({ where: { id } })).availablePlaces).toBe(2);
  });
  it('serializes publication against reservation for the same user and local date', async () => {
    const p = await player(); const id = await match();
    const results = await Promise.all([
      p.browser.send('post', path(id), { places: 1 }),
      p.browser.send('post', '/matches', {
        sportId, locationId, startsAt: '2099-11-04T01:00:00Z',
        placeName: 'Publication race', address: '1 y 2', pricePerPerson: '1000', totalPlaces: 2,
      }),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    if (results[1].status === 201) matchIds.push(results[1].body.id);
    expect(await db.participation.count({ where: { userId: p.id, active: true } })).toBe(1);
    expect((await db.match.findUniqueOrThrow({ where: { id } })).availablePlaces).toBe(results[0].status === 201 ? 1 : 2);
    expect(results.find(r => r.status === 409)?.body.code).toMatch(/^(DAILY_PARTICIPATION_CONFLICT|PARTICIPATION_DATE_CONFLICT)$/);
  });
  it('requires authentication, CSRF and trusted Origin', async () => {
    const id = await match(); const anon = new Browser(); await anon.prepare();
    expect((await anon.send('get', `${path(id)}/me`)).status).toBe(401);
    expect((await anon.send('post', path(id), { places: 1 })).status).toBe(401);
    const p = await player();
    expect((await p.browser.send('post', path(id), { places: 1 }, false)).status).toBe(403);
    expect((await p.browser.send('post', path(id), { places: 1 }, true, 'https://hostile.example')).status).toBe(403);
  });
});

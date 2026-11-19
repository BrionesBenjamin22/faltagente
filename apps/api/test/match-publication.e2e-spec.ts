import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';

describe(
  'match publication against real PostgreSQL',
  { timeout: 30000 },
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let sportId: string;
    let formatId: string;
    let locationId: string;
    const users: string[] = [];
    const payload = () => ({
      sportId,
      sportFormatId: formatId,
      locationId,
      startsAt: '2099-11-13T00:30:00Z',
      placeName: 'Cancha Central',
      address: 'Calle 1 y 2',
      pricePerPerson: '2500.50',
      totalPlaces: 3,
      description: 'Nivel inicial',
    });
    class Browser {
      cookies: string[] = [];
      csrf = '';
      async prepare(userId?: string) {
        const response = await request(app.getHttpServer()).get(
          '/api/v1/auth/csrf',
        );
        this.cookies = (
          (response.headers['set-cookie'] ?? []) as unknown as string[]
        ).map((cookie) => cookie.split(';')[0]);
        this.csrf = response.body.csrfToken;
        if (userId) {
          const session = await db.session.create({
            data: {
              userId,
              refreshHash: randomUUID(),
              expiresAt: new Date('2100-01-01T00:00:00Z'),
            },
          });
          const token = await app
            .get(JwtService)
            .signAsync(
              { sub: userId, sid: session.id },
              {
                issuer: 'hyt-api',
                audience: 'hyt-web',
                algorithm: 'HS256',
                secret: process.env.JWT_SECRET!,
                expiresIn: '15m',
              },
            );
          this.cookies.push(`furvo-access=${token}`);
        }
      }
      post(body: object, csrf = true, origin = 'http://localhost:3000') {
        const operation = request(app.getHttpServer())
          .post('/api/v1/matches')
          .set('Cookie', this.cookies)
          .set('Origin', origin);
        if (csrf) operation.set('X-CSRF-Token', this.csrf);
        return operation.send(body);
      }
      get(path: string) {
        return request(app.getHttpServer())
          .get(`/api/v1${path}`)
          .set('Cookie', this.cookies);
      }
    }
    async function fixture() {
      const user = await db.user.create({
        data: {
          name: 'Organizador',
          email: `publication-${randomUUID()}@example.test`,
        },
      });
      users.push(user.id);
      const browser = new Browser();
      await browser.prepare(user.id);
      return { user, browser };
    }
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.pathname !== '/falta-gente-test'
      )
        throw new Error(
          'Publication tests require isolated local falta-gente-test.',
        );
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      configureApplication(app);
      await app.init();
      db = app.get(PrismaService);
      const suffix = randomUUID();
      locationId = (
        await db.location.create({
          data: { name: `Publicación ${suffix}`, type: 'LOCALIDAD' },
        })
      ).id;
      sportId = (
        await db.sport.create({
          data: { name: 'Deporte publicación', slug: `publication-${suffix}` },
        })
      ).id;
      formatId = (
        await db.sportFormat.create({
          data: { sportId, name: 'Formato', slug: 'formato' },
        })
      ).id;
    });
    afterAll(async () => {
      if (db) {
        await db.participation.deleteMany({ where: { userId: { in: users } } });
        await db.match.deleteMany({ where: { organizerId: { in: users } } });
        await db.user.deleteMany({ where: { id: { in: users } } });
        if (locationId) await db.location.delete({ where: { id: locationId } });
        if (sportId) {
          await db.sportFormat.deleteMany({ where: { sportId } });
          await db.sport.delete({ where: { id: sportId } });
        }
      }
      await app?.close();
    });

    it('creates match, organizer and private publication history atomically without email verification', async () => {
      const { user, browser } = await fixture();
      const response = await browser.post(payload()).expect(201);
      expect(Object.keys(response.body)).toEqual(['id']);
      const match = await db.match.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(match).toMatchObject({
        organizerId: user.id,
        totalPlaces: 3,
        availablePlaces: 3,
        status: 'OPEN',
        version: 1,
        venueName: 'Cancha Central',
      });
      const participation = await db.participation.findFirstOrThrow({
        where: { matchId: match.id },
      });
      expect(participation).toMatchObject({
        userId: user.id,
        role: 'ORGANIZER',
        active: true,
        localDate: new Date('2099-11-12T00:00:00Z'),
      });
      expect(
        (await browser.get(`/matches/${match.id}/management`).expect(200)).body,
      ).toMatchObject({ id: match.id, totalPlaces: 3, version: 1 });
      const history = (
        await browser.get(`/matches/${match.id}/history`).expect(200)
      ).body;
      expect(history).toMatchObject({
        total: 1,
        page: 1,
        pageSize: 3,
        hasMore: false,
        items: [
          {
            event: 'PUBLISHED',
            actor: { id: user.id, name: user.name },
            changes: { totalPlaces: { before: null, after: 3 } },
          },
        ],
      });
      expect(
        (await browser.get(`/matches/${match.id}/history?page=2`).expect(200))
          .body.items,
      ).toEqual([]);
      const other = (await fixture()).browser;
      await other.get(`/matches/${match.id}/management`).expect(403);
      await other.get(`/matches/${match.id}/history`).expect(403);
      const guest = new Browser();
      await guest.prepare();
      await guest.get(`/matches/${match.id}/history`).expect(401);
      await guest.post(payload()).expect(401);
      await browser.get(`/matches/${match.id}/history?page=0`).expect(400);
      const publicMatch = (
        await browser.get(`/matches/${match.id}`).expect(200)
      ).body;
      expect(publicMatch).not.toHaveProperty('version');
      expect(publicMatch).not.toHaveProperty('createdAt');
    });

    it('serializes simultaneous publications and checks the local date rather than UTC date', async () => {
      const { user, browser } = await fixture();
      const results = await Promise.all([
        browser.post(payload()),
        browser.post({ ...payload(), startsAt: '2099-11-12T22:00:00Z' }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(results.find((result) => result.status === 409)!.body.code).toBe(
        'PARTICIPATION_DATE_CONFLICT',
      );
      expect(await db.match.count({ where: { organizerId: user.id } })).toBe(1);
      expect(await db.participation.count({ where: { userId: user.id } })).toBe(
        1,
      );
      expect(await db.matchChange.count({ where: { actorId: user.id } })).toBe(
        1,
      );
      await browser
        .post({
          ...payload(),
          startsAt: '2099-11-13T03:00:00Z',
          sportFormatId: null,
          description: '',
        })
        .expect(201);
    });

    it('lists only organized matches with nine results and disjoint status filters', async () => {
      const { user, browser } = await fixture();
      const other = await fixture();
      const base = { organizerId: user.id, sportId, locationId, venueName: 'Listado propio', address: 'Calle 1', pricePerPerson: '0', totalPlaces: 2, availablePlaces: 2 };
      await db.match.createMany({ data: [
        ...Array.from({ length: 10 }, (_, index) => ({ ...base, startsAt: new Date(`2099-12-${String(index + 1).padStart(2, '0')}T20:00:00Z`) })),
        { ...base, startsAt: new Date('2000-01-01T20:00:00Z') },
        { ...base, status: 'CANCELLED', startsAt: new Date('2099-12-20T20:00:00Z') },
        { ...base, organizerId: other.user.id, startsAt: new Date('2099-12-21T20:00:00Z') },
      ] });
      const first = (await browser.get('/users/me/matches').expect(200)).body;
      const second = (await browser.get('/users/me/matches?page=2').expect(200)).body;
      expect(first).toMatchObject({ total: 10, pageSize: 9, hasMore: true });
      expect(first.items).toHaveLength(9);
      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
      expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(10);
      expect((await browser.get('/users/me/matches?filter=past').expect(200)).body.total).toBe(1);
      const cancelled = (await browser.get('/users/me/matches?filter=cancelled').expect(200)).body;
      expect(cancelled.items).toHaveLength(1);
      expect(cancelled.items[0].status).toBe('CANCELLED');
      expect((await other.browser.get('/users/me/matches').expect(200)).body.total).toBe(1);
      const guest = new Browser(); await guest.prepare();
      await guest.get('/users/me/matches').expect(401);
      await browser.get('/users/me/matches?filter=invalid').expect(400);
      await browser.get('/users/me/matches?organizerId=' + other.user.id).expect(400);
      await browser.get('/users/me/matches?page=0').expect(400);
    });

    it('rejects invalid payloads, catalogs, CSRF and Origin without partial writes', async () => {
      const { user, browser } = await fixture();
      for (const change of [
        { startsAt: '2000-01-01T12:00:00Z' },
        { startsAt: '2099-11-12T12:00:00' },
        { startsAt: '2099-02-30T12:00:00Z' },
        { totalPlaces: 0 },
        { totalPlaces: 1.5 },
        { totalPlaces: '3' },
        { totalPlaces: null },
        { pricePerPerson: '-1' },
        { pricePerPerson: 5 },
        { pricePerPerson: '1.234' },
        { placeName: ' ' },
        { placeName: null },
        { description: 'a'.repeat(2001) },
        { address: 'a'.repeat(201) },
        { organizerId: user.id },
        { status: 'CLOSED' },
        { sportId: randomUUID() },
        { locationId: randomUUID() },
        { sportFormatId: randomUUID() },
      ])
        await browser.post({ ...payload(), ...change }).expect(400);
      await browser.post(payload(), false).expect(403);
      await browser
        .post(payload(), true, 'https://attacker.example')
        .expect(403);
      for (const updateActive of [
        (active: boolean) => db.sport.update({ where: { id: sportId }, data: { active } }),
        (active: boolean) => db.sportFormat.update({ where: { id: formatId }, data: { active } }),
        (active: boolean) => db.location.update({ where: { id: locationId }, data: { active } }),
      ]) {
        await updateActive(false);
        try {
          await browser.post(payload()).expect(400);
        } finally {
          await updateActive(true);
        }
      }
      expect(await db.match.count({ where: { organizerId: user.id } })).toBe(0);
      expect(await db.participation.count({ where: { userId: user.id } })).toBe(
        0,
      );
      expect(await db.matchChange.count({ where: { actorId: user.id } })).toBe(
        0,
      );
    });
  },
);

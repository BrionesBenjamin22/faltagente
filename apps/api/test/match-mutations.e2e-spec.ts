import { randomUUID } from 'node:crypto';
import { isolatedDatabaseUrl } from './isolated-database.js';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';

describe('match mutations against real PostgreSQL', { timeout: 30000 }, () => {
  let app: INestApplication;
  let db: PrismaService;
  let sportId: string;
  let formatId: string;
  let locationId: string;
  const users: string[] = [];
  const extraSports: string[] = [];
  const extraLocations: string[] = [];
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
        const token = await app.get(JwtService).signAsync(
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
    mutate(
      id: string,
      body: object,
      cancel = false,
      csrf = true,
      origin = 'http://localhost:3000',
    ) {
      const operation = cancel
        ? request(app.getHttpServer()).post(`/api/v1/matches/${id}/cancel`)
        : request(app.getHttpServer()).patch(`/api/v1/matches/${id}`);
      operation.set('Cookie', this.cookies).set('Origin', origin);
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
    isolatedDatabaseUrl(process.env.DATABASE_URL);
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
      await db.sportFormat.deleteMany({ where: { sportId: { in: extraSports } } });
      await db.sport.deleteMany({ where: { id: { in: extraSports } } });
      await db.location.deleteMany({ where: { id: { in: extraLocations } } });
      if (locationId) await db.location.delete({ where: { id: locationId } });
      if (sportId) {
        await db.sportFormat.deleteMany({ where: { sportId } });
        await db.sport.delete({ where: { id: sportId } });
      }
    }
    await app?.close();
  });

  async function published() {
    const fixtureValue = await fixture();
    const response = await fixtureValue.browser.post(payload()).expect(201);
    return { ...fixtureValue, id: response.body.id as string };
  }
  it('normalizes equivalent values and makes partial edits with exactly one audit event', async () => {
    const { browser, id } = await published();
    const original = await db.match.findUniqueOrThrow({ where: { id } });
    await browser
      .mutate(id, {
        expectedVersion: 1,
        placeName: ' Cancha Central ',
        pricePerPerson: '02500.50',
        startsAt: '2099-11-12T21:30:00-03:00',
      })
      .expect(200);
    const unchanged = await db.match.findUniqueOrThrow({ where: { id } });
    expect(unchanged.version).toBe(1);
    expect(unchanged.updatedAt).toEqual(original.updatedAt);
    await browser
      .mutate(id, {
        expectedVersion: 1,
        description: null,
        sportFormatId: null,
      })
      .expect(200);
    const changed = await db.match.findUniqueOrThrow({ where: { id } });
    expect(changed).toMatchObject({
      version: 2,
      description: null,
      sportFormatId: null,
    });
    const history = (await browser.get(`/matches/${id}/history`).expect(200))
      .body;
    expect(history.total).toBe(2);
    expect(history.items[0]).toMatchObject({
      event: 'UPDATED',
      changes: {
        sportFormatId: {
          before: { id: formatId, name: 'Formato' },
          after: null,
        },
      },
    });
    await browser
      .mutate(id, { expectedVersion: 1, description: 'viejo' })
      .expect(409);
  });
  it('enforces authorization, CSRF, Origin, partial validation and allowlist', async () => {
    const { browser, id } = await published();
    const other = await fixture();
    const guest = new Browser();
    await guest.prepare();
    await guest.mutate(id, { expectedVersion: 1 }).expect(401);
    await other.browser.mutate(id, { expectedVersion: 1 }).expect(403);
    await other.browser.mutate(id, { expectedVersion: 1 }, true).expect(403);
    await browser.mutate(id, { expectedVersion: 1 }, false, false).expect(403);
    await browser.mutate(id, { expectedVersion: 1 }, true, false).expect(403);
    await browser
      .mutate(
        id,
        { expectedVersion: 1 },
        false,
        true,
        'https://attacker.example',
      )
      .expect(403);
    await browser
      .mutate(
        id,
        { expectedVersion: 1 },
        true,
        true,
        'https://attacker.example',
      )
      .expect(403);
    for (const changes of [
      { totalPlaces: null },
      { sportId: null },
      { locationId: null },
      { address: null },
      { placeName: null },
      { pricePerPerson: null },
      { startsAt: null },
      { totalPlaces: 0 },
      { organizerId: other.user.id },
      { availablePlaces: 50 },
      { status: 'CANCELLED' },
      { version: 100 },
      { startsAt: '2099-02-30T20:00:00Z' },
      { description: 'a'.repeat(2001) },
    ]) {
      const response = await browser
        .mutate(id, { expectedVersion: 1, ...changes })
        .expect(400);
      expect(response.body).toHaveProperty('requestId');
    }
    await browser.mutate(id, { description: 'sin versi?n' }).expect(400);
    await browser
      .mutate(id, { expectedVersion: 1, reason: null }, true)
      .expect(400);
    await browser
      .mutate(id, { expectedVersion: 1, reason: 'a'.repeat(501) }, true)
      .expect(400);
    expect(await db.matchChange.count({ where: { matchId: id } })).toBe(1);
  });
  it('preserves inactive catalogs and legacy values but validates replacement catalogs', async () => {
    const { browser, id } = await published();
    await db.sport.update({ where: { id: sportId }, data: { active: false } });
    await db.sportFormat.update({
      where: { id: formatId },
      data: { active: false },
    });
    await db.location.update({
      where: { id: locationId },
      data: { active: false },
    });
    await db.match.update({
      where: { id },
      data: { totalPlaces: 0, availablePlaces: 0, venueName: 'x' },
    });
    try {
      await browser
        .mutate(id, {
          expectedVersion: 1,
          description: 'Conservar datos hist?ricos',
        })
        .expect(200);
      await browser
        .mutate(id, { expectedVersion: 2, sportId: randomUUID() })
        .expect(400);
      await browser
        .mutate(id, { expectedVersion: 2, locationId: randomUUID() })
        .expect(400);
      await browser
        .mutate(id, { expectedVersion: 2, sportFormatId: randomUUID() })
        .expect(400);
      const management = (
        await browser.get(`/matches/${id}/management`).expect(200)
      ).body;
      expect(management.sport.active).toBe(false);
    } finally {
      await db.sport.update({ where: { id: sportId }, data: { active: true } });
      await db.sportFormat.update({
        where: { id: formatId },
        data: { active: true },
      });
      await db.location.update({
        where: { id: locationId },
        data: { active: true },
      });
    }
  });
  it('changes local participation date and rejects daily conflicts atomically', async () => {
    const { browser, user, id } = await published();
    await browser
      .mutate(id, { expectedVersion: 1, startsAt: '2099-11-14T01:00:00Z' })
      .expect(200);
    expect(
      await db.participation.findFirst({ where: { matchId: id } }),
    ).toMatchObject({ localDate: new Date('2099-11-13T00:00:00Z') });
    await browser
      .post({ ...payload(), startsAt: '2099-11-15T22:00:00Z' })
      .expect(201);
    const conflict = await browser
      .mutate(id, {
        expectedVersion: 2,
        startsAt: '2099-11-16T01:00:00Z',
        description: 'No debe persistir',
      })
      .expect(409);
    expect(conflict.body.code).toBe('PARTICIPATION_DATE_CONFLICT');
    expect(await db.match.findUnique({ where: { id } })).toMatchObject({
      version: 2,
      description: 'Nivel inicial',
    });
    expect(
      await db.participation.count({
        where: { userId: user.id, active: true },
      }),
    ).toBe(2);
  });
  it('preserves occupancy, closes and reopens capacity, blocks restricted and inconsistent data', async () => {
    const { browser, id } = await published();
    const player = await fixture();
    await db.participation.create({
      data: {
        userId: player.user.id,
        matchId: id,
        role: 'PLAYER',
        localDate: new Date('2099-11-12'),
      },
    });
    await db.match.update({ where: { id }, data: { availablePlaces: 1 } });
    await browser
      .mutate(id, { expectedVersion: 1, totalPlaces: 2 })
      .expect(200);
    expect(await db.match.findUnique({ where: { id } })).toMatchObject({
      totalPlaces: 2,
      availablePlaces: 0,
      status: 'CLOSED',
      version: 2,
    });
    await browser
      .mutate(id, { expectedVersion: 2, totalPlaces: 5 })
      .expect(200);
    expect(await db.match.findUnique({ where: { id } })).toMatchObject({
      totalPlaces: 5,
      availablePlaces: 3,
      status: 'OPEN',
      version: 3,
    });
    expect(
      (
        await browser
          .mutate(id, { expectedVersion: 3, totalPlaces: 1 })
          .expect(409)
      ).body.code,
    ).toBe('MATCH_CAPACITY_INSUFFICIENT');
    for (const changes of [
      { placeName: 'Otro lugar' },
      { sportFormatId: null },
      { sportId: randomUUID() },
      { locationId: randomUUID() },
      { pricePerPerson: '1' },
      { address: 'Otra calle' },
      { startsAt: '2099-12-01T20:00:00Z' },
    ])
      expect(
        (
          await browser
            .mutate(id, { expectedVersion: 3, ...changes })
            .expect(409)
        ).body.code,
      ).toBe('MATCH_FIELDS_RESTRICTED');
    expect(
      (await browser.mutate(id, { expectedVersion: 3 }, true).expect(409)).body
        .code,
    ).toBe('MATCH_CANCELLATION_INCONSISTENT');
    await db.participation.updateMany({
      where: { matchId: id, role: 'PLAYER' },
      data: { active: false },
    });
    expect(
      (
        await browser
          .mutate(id, { expectedVersion: 3, totalPlaces: 6 })
          .expect(409)
      ).body.code,
    ).toBe('MATCH_CAPACITY_INCONSISTENT');
    await browser
      .mutate(id, { expectedVersion: 3, description: 'Descripci?n permitida' })
      .expect(200);
    expect(
      (await browser.get(`/matches/${id}/management`).expect(200)).body
        .canAdjustCapacity,
    ).toBe(false);
  });
  it('cancels once, keeps reason private, frees daily participation and preserves lists/history', async () => {
    const { browser, id } = await published();
    await browser
      .mutate(id, { expectedVersion: 1, reason: '  Lluvia privada  ' }, true)
      .expect(201);
    const cancelled = await db.match.findUniqueOrThrow({ where: { id } });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Lluvia privada',
      version: 2,
      totalPlaces: 3,
      availablePlaces: 3,
    });
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(
      await db.participation.findFirst({ where: { matchId: id } }),
    ).toMatchObject({ active: false });
    await browser
      .mutate(id, { expectedVersion: 1, reason: 'Cambiar raz?n' }, true)
      .expect(201);
    expect(await db.match.findUniqueOrThrow({ where: { id } })).toEqual(
      cancelled,
    );
    expect(
      await db.matchChange.count({
        where: { matchId: id, event: 'CANCELLED' },
      }),
    ).toBe(1);
    const publicMatch = (await browser.get(`/matches/${id}`).expect(200)).body;
    expect(publicMatch).not.toHaveProperty('cancellationReason');
    const discover = (
      await browser.get(`/matches?locationId=${locationId}`).expect(200)
    ).body;
    expect(discover.items.some((item: { id: string }) => item.id === id)).toBe(
      false,
    );
    const own = (
      await browser.get('/users/me/matches?filter=cancelled').expect(200)
    ).body;
    expect(own.items.some((item: { id: string }) => item.id === id)).toBe(true);
    expect(
      (await browser.get(`/matches/${id}/management`).expect(200)).body,
    ).toMatchObject({
      cancellationReason: 'Lluvia privada',
      canEdit: false,
      canCancel: false,
    });
    await browser
      .mutate(id, { expectedVersion: 2, description: 'Ya cancelado' })
      .expect(409);
    await browser.post(payload()).expect(201);
  });
  it('serializes competing edits and edit-versus-cancel without duplicate events or partial writes', async () => {
    const first = await published();
    const result = await Promise.all([
      first.browser.mutate(first.id, { expectedVersion: 1, description: 'A' }),
      first.browser.mutate(first.id, { expectedVersion: 1, description: 'B' }),
    ]);
    expect(result.map((value) => value.status).sort()).toEqual([200, 409]);
    expect(result.find((value) => value.status === 409)!.body.code).toBe(
      'MATCH_VERSION_CONFLICT',
    );
    expect(await db.matchChange.count({ where: { matchId: first.id } })).toBe(
      2,
    );
    const second = await published();
    const race = await Promise.all([
      second.browser.mutate(second.id, {
        expectedVersion: 1,
        description: 'Edici?n',
      }),
      second.browser.mutate(second.id, { expectedVersion: 1 }, true),
    ]);
    expect(race.filter((value) => value.status < 300)).toHaveLength(1);
    expect(race.find((value) => value.status === 409)!.body.code).toBe(
      'MATCH_VERSION_CONFLICT',
    );
    expect(await db.matchChange.count({ where: { matchId: second.id } })).toBe(
      2,
    );
    expect(
      (await db.match.findUniqueOrThrow({ where: { id: second.id } })).version,
    ).toBe(2);
  });
  it('rejects started matches and accepts empty cancellation reason as null', async () => {
    const { browser, id } = await published();
    await db.match.update({
      where: { id },
      data: { startsAt: new Date('2000-01-01') },
    });
    await browser
      .mutate(id, { expectedVersion: 1, description: 'No' })
      .expect(409);
    await browser.mutate(id, { expectedVersion: 1 }, true).expect(409);
    const other = await published();
    await other.browser
      .mutate(other.id, { expectedVersion: 1, reason: '   ' }, true)
      .expect(201);
    expect(
      await db.match.findUnique({ where: { id: other.id } }),
    ).toMatchObject({ cancellationReason: null });
  });

  it('validates replacement catalog activity and format ownership, then records coherent relation snapshots', async () => {
    const { browser, id } = await published();
    const sport = await db.sport.create({ data: { name: 'Deporte alternativo', slug: `review-${randomUUID()}`, active: false } });
    extraSports.push(sport.id);
    const format = await db.sportFormat.create({ data: { sportId: sport.id, name: 'Formato alternativo', slug: 'alternativo', active: false } });
    const location = await db.location.create({ data: { name: 'Localidad alternativa', type: 'LOCALIDAD', active: false } });
    extraLocations.push(location.id);
    await browser.mutate(id, { expectedVersion: 1, sportId: sport.id, sportFormatId: format.id }).expect(400);
    await browser.mutate(id, { expectedVersion: 1, locationId: location.id }).expect(400);
    await db.sport.update({ where: { id: sport.id }, data: { active: true } });
    await browser.mutate(id, { expectedVersion: 1, sportId: sport.id }).expect(400);
    await browser.mutate(id, { expectedVersion: 1, sportId: sport.id, sportFormatId: format.id }).expect(400);
    await db.sportFormat.update({ where: { id: format.id }, data: { active: true } });
    await db.location.update({ where: { id: location.id }, data: { active: true } });
    await browser.mutate(id, { expectedVersion: 1, sportId: sport.id, sportFormatId: format.id, locationId: location.id, description: 'Nueva información' }).expect(200);
    const management = (await browser.get(`/matches/${id}/management`).expect(200)).body;
    expect(management).toMatchObject({
      version: 2, sport: { id: sport.id, name: sport.name }, sportFormat: { id: format.id, name: format.name },
      location: { id: location.id, name: location.name }, description: 'Nueva información',
      totalPlaces: 3, availablePlaces: 3, occupiedPlaces: 0, activePlayerCount: 0,
      hasConfirmedParticipants: false, canEdit: true, canCancel: true, canAdjustCapacity: true,
    });
    const history = (await browser.get(`/matches/${id}/history`).expect(200)).body;
    expect(history.total).toBe(2);
    expect(history.items[0]).toMatchObject({ event: 'UPDATED', changes: {
      sportId: { before: { id: sportId, name: 'Deporte publicación' }, after: { id: sport.id, name: sport.name } },
      sportFormatId: { before: { id: formatId, name: 'Formato' }, after: { id: format.id, name: format.name } },
      locationId: { before: { id: locationId }, after: { id: location.id, name: location.name } },
    } });
  });

  it('blocks capacity and cancellation when active players exist without occupied places', async () => {
    const { browser, id } = await published();
    const player = await fixture();
    await db.participation.create({ data: { userId: player.user.id, matchId: id, role: 'PLAYER', localDate: new Date('2099-11-12') } });
    const management = (await browser.get(`/matches/${id}/management`).expect(200)).body;
    expect(management).toMatchObject({ occupiedPlaces: 0, activePlayerCount: 1, hasConfirmedParticipants: true, canCancel: true, canAdjustCapacity: false });
    expect((await browser.mutate(id, { expectedVersion: 1, totalPlaces: 4 }).expect(409)).body.code).toBe('MATCH_CAPACITY_INCONSISTENT');
    expect((await browser.mutate(id, { expectedVersion: 1 }, true).expect(409)).body.code).toBe('MATCH_CANCELLATION_INCONSISTENT');
    expect(await db.matchChange.count({ where: { matchId: id } })).toBe(1);
  });
});

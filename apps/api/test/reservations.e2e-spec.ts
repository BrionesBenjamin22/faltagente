import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
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
    async send(
      method: 'get' | 'post' | 'patch',
      path: string,
      body?: object,
      protect = true,
      origin = 'http://localhost:3000',
    ) {
      const op = request(app.getHttpServer())
        [method](`/api/v1${path}`)
        .set('Origin', origin)
        .set(
          'Cookie',
          [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        );
      if (method !== 'get' && protect) op.set('X-CSRF-Token', this.csrf);
      if (body) op.send(body);
      const res = await op;
      for (const cookie of (res.headers['set-cookie'] as unknown as
        string[] | undefined) ?? []) {
        const [k, v] = cookie.split(';')[0].split('=');
        if (v) this.cookies.set(k, v);
        else this.cookies.delete(k);
      }
      return res;
    }
    async prepare() {
      this.csrf = (await this.send('get', '/auth/csrf')).body.csrfToken;
    }
  }
  async function player() {
    const user = await db.user.create({
      data: {
        name: 'Player',
        email: `reservation-${randomUUID()}@example.test`,
        passwordHash: await argon2.hash(password),
        primaryLocationId: locationId,
      },
    });
    userIds.push(user.id);
    const browser = new Browser();
    await browser.prepare();
    expect(
      (
        await browser.send('post', '/auth/login', {
          email: user.email,
          password,
        })
      ).status,
    ).toBe(200);
    await browser.prepare();
    return { id: user.id, browser };
  }
  async function match(
    places = 2,
    startsAt = '2099-11-03T23:00:00Z',
    status: 'OPEN' | 'CLOSED' | 'CANCELLED' = 'OPEN',
  ) {
    const row = await db.match.create({
      data: {
        organizerId,
        locationId,
        sportId,
        availablePlaces: places,
        totalPlaces: places,
        startsAt: new Date(startsAt),
        status,
        venueName: 'Reservation court',
        address: '1 y 2',
        pricePerPerson: 1000,
      },
    });
    matchIds.push(row.id);
    return row.id;
  }
  const path = (id: string) => `/matches/${id}/reservations`;
  beforeAll(async () => {
    isolatedDatabaseUrl(process.env.DATABASE_URL);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: async () => {} })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    locationId = (
      await db.location.create({
        data: { name: `Reservations ${randomUUID()}`, type: 'LOCALIDAD' },
      })
    ).id;
    sportId = (await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } }))
      .id;
    organizerId = (await player()).id;
  });
  beforeEach(() => {
    // Independent cases retain the real guard without consuming each other's quota.
    app.get<ThrottlerStorageService>(getStorageToken()).onApplicationShutdown();
  });
  afterAll(async () => {
    if (db) {
      await db.reservation.deleteMany({ where: { matchId: { in: matchIds } } });
      await db.matchChange.deleteMany({ where: { matchId: { in: matchIds } } });
      await db.participation.deleteMany({ where: { userId: { in: userIds } } });
      await db.match.deleteMany({ where: { id: { in: matchIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      if (locationId) await db.location.delete({ where: { id: locationId } });
    }
    await app?.close();
  });
  it('reduces a reservation for its holder and organizer while preserving daily participation and private movements', async () => {
    const { organizer, id } = await organized(5);
    const p = await player();
    const r = (await p.browser.send('post', path(id), { places: 5 })).body;
    const endpoint = `${path(id)}/${r.id}/places`;
    const before = await db.match.findUniqueOrThrow({ where: { id } });
    expect(
      (
        await p.browser.send('patch', endpoint, {
          expectedVersion: 1,
          places: 5,
        })
      ).body.version,
    ).toBe(1);
    expect(await db.match.findUniqueOrThrow({ where: { id } })).toEqual(before);
    expect(
      await db.reservationCancellation.count({
        where: { reservationId: r.id },
      }),
    ).toBe(0);
    const partial = await p.browser.send('patch', endpoint, {
      expectedVersion: 1,
      places: 4,
    });
    expect(partial.status).toBe(200);
    expect(partial.body).toMatchObject({
      places: 4,
      originalPlaces: 5,
      version: 2,
      status: 'CONFIRMED',
    });
    expect(partial.headers['cache-control']).toBe('no-store');
    expect(
      (
        await p.browser.send('patch', endpoint, {
          expectedVersion: 1,
          places: 4,
        })
      ).status,
    ).toBe(409);
    expect(
      (await p.browser.send('post', path(await match()), { places: 1 })).body
        .code,
    ).toBe('DAILY_PARTICIPATION_CONFLICT');
    expect(
      (
        await organizer.browser.send('patch', endpoint, {
          expectedVersion: 2,
          places: 3,
          reason: '  Ajuste del organizador  ',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await p.browser.send('patch', endpoint, {
          expectedVersion: 3,
          places: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await p.browser.send('patch', endpoint, {
          expectedVersion: 4,
          places: 1,
        })
      ).status,
    ).toBe(200);
    const first = (
      await p.browser.send('get', `${path(id)}/${r.id}/cancellations`)
    ).body;
    expect(first).toMatchObject({ total: 4, pageSize: 3, hasMore: true });
    expect(
      first.items.map(
        (row: { remainingPlaces: number }) => row.remainingPlaces,
      ),
    ).toEqual([1, 2, 3]);
    expect(first.items[2]).toMatchObject({
      source: 'ORGANIZER',
      reason: 'Ajuste del organizador',
      previousPlaces: 4,
      remainingPlaces: 3,
    });
    expect(
      (await p.browser.send('get', `${path(id)}/${r.id}/cancellations?page=2`))
        .body,
    ).toMatchObject({
      total: 4,
      hasMore: false,
      items: [
        { source: 'USER', reason: null, previousPlaces: 5, remainingPlaces: 4 },
      ],
    });
    expect(
      (await organizer.browser.send('get', `${path(id)}/${r.id}/cancellations`))
        .status,
    ).toBe(404);
    expect(
      await db.participation.findUnique({
        where: { userId_matchId: { userId: p.id, matchId: id } },
      }),
    ).toMatchObject({ active: true });
    const list = await organizer.browser.send('get', path(id));
    expect(list.body).toMatchObject({
      total: 1,
      pageSize: 9,
      items: [
        {
          places: 1,
          originalPlaces: 5,
          version: 5,
          holder: { id: p.id, name: 'Player' },
        },
      ],
    });
    expect(JSON.stringify(list.body)).not.toMatch(
      /Ajuste|cancellationReason|email|password/,
    );
    expect((await p.browser.send('get', path(id))).status).toBe(403);
    expect(
      (await p.browser.send('post', `${path(id)}/${r.id}/cancel`, {})).status,
    ).toBe(200);
    expect(
      await db.reservation.findUnique({ where: { id: r.id } }),
    ).toMatchObject({ places: 1, originalPlaces: 5, status: 'CANCELLED' });
    expect(
      (await p.browser.send('post', path(await match()), { places: 1 })).status,
    ).toBe(201);
  });
  it('validates reduction quantity, ownership, reason, session, CSRF, Origin and PostgreSQL start time', async () => {
    const { organizer, id } = await organized(3);
    const p = await player();
    const other = await player();
    const r = (await p.browser.send('post', path(id), { places: 3 })).body;
    const endpoint = `${path(id)}/${r.id}/places`;
    for (const places of [0, -1, 1.5, '2', 101])
      expect(
        (
          await p.browser.send('patch', endpoint, {
            expectedVersion: 1,
            places,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await p.browser.send('patch', endpoint, {
          expectedVersion: 1,
          places: 4,
        })
      ).body.code,
    ).toBe('RESERVATION_INCREASE_FORBIDDEN');
    for (const places of [2, 3])
      expect(
        (
          await p.browser.send('patch', endpoint, {
            expectedVersion: 1,
            places,
            reason: 'Prohibido',
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await other.browser.send('patch', endpoint, {
          expectedVersion: 1,
          places: 2,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await organizer.browser.send('patch', endpoint, {
          expectedVersion: 1,
          places: 2,
          reason: 'x'.repeat(501),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await p.browser.send(
          'patch',
          endpoint,
          { expectedVersion: 1, places: 2 },
          false,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await p.browser.send(
          'patch',
          endpoint,
          { expectedVersion: 1, places: 2 },
          true,
          'https://hostile.test',
        )
      ).status,
    ).toBe(403);
    const anon = new Browser();
    await anon.prepare();
    expect(
      (await anon.send('patch', endpoint, { expectedVersion: 1, places: 2 }))
        .status,
    ).toBe(401);
    expect(
      (
        await p.browser.send('post', `${path(id)}/${r.id}/cancel`, {
          reason: 'No permitido',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await p.browser.send('patch', endpoint, {
          expectedVersion: 1,
          places: 2,
          userId: p.id,
        })
      ).status,
    ).toBe(400);
    await db.match.update({
      where: { id },
      data: { startsAt: new Date('2000-01-01') },
    });
    expect(
      (
        await p.browser.send('patch', endpoint, {
          expectedVersion: 1,
          places: 2,
        })
      ).status,
    ).toBe(409);
    expect(
      await db.reservationCancellation.count({
        where: { reservationId: r.id },
      }),
    ).toBe(0);
    expect(await db.match.findUnique({ where: { id } })).toMatchObject({
      availablePlaces: 0,
    });
  });
  it('limits new reservations to 100 places and paginates organizer reservations by nine', async () => {
    const p = await player();
    const id = await match(101);
    expect(
      (await p.browser.send('post', path(id), { places: 101 })).status,
    ).toBe(400);
    expect(
      (await p.browser.send('post', path(id), { places: 100 })).body,
    ).toMatchObject({ places: 100, originalPlaces: 100, version: 1 });
    const fixture = await organized(10);
    for (let index = 0; index < 10; index++) {
      const holder = await db.user.create({
        data: { name: 'Holder', email: `fixture-${randomUUID()}@example.test` },
      });
      userIds.push(holder.id);
      await db.reservation.create({
        data: { matchId: fixture.id, userId: holder.id, places: 1 },
      });
    }
    expect(
      (await fixture.organizer.browser.send('get', path(fixture.id))).body
        .items,
    ).toHaveLength(9);
    expect(
      (
        await fixture.organizer.browser.send(
          'get',
          `${path(fixture.id)}?page=2`,
        )
      ).body,
    ).toMatchObject({ total: 10, page: 2, pageSize: 9, hasMore: false });
  });
  it.each(['reduce', 'total', 'match', 'booking', 'organizer'] as const)(
    'serializes reduction against %s without overbooking or duplicate release',
    async (competing) => {
      const { organizer, id } = await organized(3);
      const p = await player();
      const other = await player();
      const r = (await p.browser.send('post', path(id), { places: 3 })).body;
      const version = (await db.match.findUniqueOrThrow({ where: { id } }))
        .version;
      const endpoint = `${path(id)}/${r.id}`;
      const operation =
        competing === 'reduce'
          ? p.browser.send('patch', `${endpoint}/places`, {
              expectedVersion: 1,
              places: 1,
            })
          : competing === 'total'
            ? p.browser.send('post', `${endpoint}/cancel`, {})
            : competing === 'organizer'
              ? organizer.browser.send(
                  'post',
                  `${endpoint}/cancel-by-organizer`,
                  { expectedVersion: 1 },
                )
              : competing === 'match'
                ? organizer.browser.send('post', `/matches/${id}/cancel`, {
                    expectedVersion: version,
                  })
                : other.browser.send('post', path(id), { places: 1 });
      const [partial, otherResult] = await Promise.all([
        p.browser.send('patch', `${endpoint}/places`, {
          expectedVersion: 1,
          places: 2,
        }),
        operation,
      ]);
      expect([200, 409]).toContain(partial.status);
      expect([200, 201, 409]).toContain(otherResult.status);
      if (competing === 'reduce')
        expect([partial.status, otherResult.status].sort()).toEqual([200, 409]);
      if (competing === 'match' && otherResult.status === 409)
        expect((await cancelMatch(organizer, id)).status).toBe(201);
      if (competing === 'organizer' && otherResult.status === 409)
        expect(
          (
            await organizer.browser.send(
              'post',
              `${endpoint}/cancel-by-organizer`,
              { expectedVersion: 2 },
            )
          ).status,
        ).toBe(200);
      const rows = await db.reservation.findMany({ where: { matchId: id } });
      const after = await db.match.findUniqueOrThrow({ where: { id } });
      expect(
        after.availablePlaces +
          rows
            .filter((row) => row.status === 'CONFIRMED')
            .reduce((sum, row) => sum + row.places, 0),
      ).toBe(3);
      if (['total', 'organizer', 'match'].includes(competing)) {
        expect(after.availablePlaces).toBe(3);
        expect(
          await db.participation.count({
            where: { userId: p.id, matchId: id, active: true },
          }),
        ).toBe(0);
        const movements = await db.reservationCancellation.findMany({
          where: { reservationId: r.id },
        });
        expect(
          movements.reduce(
            (sum, row) => sum + row.previousPlaces - row.remainingPlaces,
            0,
          ),
        ).toBe(3);
      }
    },
  );
  it('allows only organizer full cancellation, with optional reason visible to the holder and immutable retries', async () => {
    const { organizer, id } = await organized(3);
    const p = await player();
    const other = await player();
    const r = (await p.browser.send('post', path(id), { places: 3 })).body;
    const endpoint = `${path(id)}/${r.id}`;
    const payload = {
      expectedVersion: 1,
      reason: '  Ajuste del organizador  ',
    };
    expect(
      (await p.browser.send('post', `${endpoint}/cancel-by-organizer`, payload))
        .status,
    ).toBe(404);
    expect(
      (
        await other.browser.send(
          'post',
          `${endpoint}/cancel-by-organizer`,
          payload,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await organizer.browser.send(
          'post',
          `${endpoint}/cancel-by-organizer`,
          payload,
          false,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await organizer.browser.send(
          'post',
          `${endpoint}/cancel-by-organizer`,
          payload,
          true,
          'https://hostile.test',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await organizer.browser.send(
          'post',
          `${endpoint}/cancel-by-organizer`,
          { expectedVersion: 2 },
        )
      ).status,
    ).toBe(409);
    const result = await organizer.browser.send(
      'post',
      `${endpoint}/cancel-by-organizer`,
      payload,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ id: r.id });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(
      (
        await organizer.browser.send(
          'post',
          `${endpoint}/cancel-by-organizer`,
          { ...payload, reason: 'No reescribir' },
        )
      ).status,
    ).toBe(200);
    expect(
      (await other.browser.send('post', `${endpoint}/cancel-by-organizer`, payload))
        .status,
    ).toBe(404);
    const removalNotifications = await db.notification.findMany({
      where: { relatedMatchId: id, type: 'PLAYER_REMOVED' },
      orderBy: { dedupeKey: 'asc' },
    });
    expect(removalNotifications).toHaveLength(2);
    expect(removalNotifications.find(row => row.userId === p.id)).toMatchObject({
      actorUserId: organizer.id,
      detail: 'Ajuste del organizador',
      dedupeKey: `PLAYER_REMOVED:${id}:${r.id}`,
      metadata: { places: 3 },
    });
    expect(removalNotifications.find(row => row.userId === organizer.id)).toMatchObject({
      actorUserId: organizer.id,
      title: 'Diste de baja una reserva',
      dedupeKey: `PLAYER_REMOVED_CONFIRMATION:${id}:${r.id}`,
    });
    expect(await db.notification.count({
      where: { relatedMatchId: id, type: 'MATCH_LEFT' },
    })).toBe(0);
    expect(
      (await p.browser.send('get', `${endpoint}/cancellations`)).body,
    ).toMatchObject({
      total: 1,
      items: [
        {
          source: 'ORGANIZER',
          reason: 'Ajuste del organizador',
          previousPlaces: 3,
          remainingPlaces: 0,
        },
      ],
    });
    expect(
      (await organizer.browser.send('get', `${endpoint}/cancellations`)).status,
    ).toBe(404);
    expect(
      await db.participation.findUnique({
        where: { userId_matchId: { userId: p.id, matchId: id } },
      }),
    ).toMatchObject({ active: false });
    expect(
      await db.participation.findUnique({
        where: { userId_matchId: { userId: organizer.id, matchId: id } },
      }),
    ).toMatchObject({ active: true, role: 'ORGANIZER' });
  });
  it('reserves multiple places, creates PLAYER, closes full match and retries idempotently', async () => {
    const p = await player();
    const id = await match();
    const empty = await p.browser.send('get', `${path(id)}/me`);
    expect(empty.body).toBeNull();
    expect(empty.text).toBe('null');
    const results = await Promise.all(
      [1, 2].map(() => p.browser.send('post', path(id), { places: 2 })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(Object.keys(results[0].body).sort()).toEqual([
      'createdAt',
      'id',
      'matchId',
      'originalPlaces',
      'places',
      'version',
    ]);
    expect((await p.browser.send('get', `${path(id)}/me`)).body).toEqual(
      results[0].body,
    );
    expect(await db.match.findUnique({ where: { id } })).toMatchObject({
      availablePlaces: 0,
      totalPlaces: 2,
      status: 'CLOSED',
    });
    expect(
      await db.participation.findMany({ where: { userId: p.id, matchId: id } }),
    ).toMatchObject([{ role: 'PLAYER', active: true }]);
    expect(await db.reservation.count({ where: { matchId: id } })).toBe(1);
    expect(
      (await p.browser.send('post', path(id), { places: 1 })).body.code,
    ).toBe('RESERVATION_ALREADY_EXISTS');
    const other = await player();
    expect((await other.browser.send('get', `${path(id)}/me`)).body).toBeNull();
  });
  it('serializes competing users for the last place without overselling', async () => {
    const a = await player();
    const b = await player();
    const id = await match(1);
    const results = await Promise.all(
      [a, b].map((p) => p.browser.send('post', path(id), { places: 1 })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.reservation.count({ where: { matchId: id } })).toBe(1);
    expect(
      (await db.match.findUniqueOrThrow({ where: { id } })).availablePlaces,
    ).toBe(0);
  });
  it('enforces local daily uniqueness concurrently across UTC dates, but allows the next local day', async () => {
    const p = await player();
    const a = await match(2, '2099-11-03T23:00:00Z');
    const b = await match(2, '2099-11-04T01:00:00Z');
    const results = await Promise.all(
      [a, b].map((id) => p.browser.send('post', path(id), { places: 1 })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe(
      'DAILY_PARTICIPATION_CONFLICT',
    );
    expect(await db.reservation.count({ where: { userId: p.id } })).toBe(1);
    const publication = await p.browser.send('post', '/matches', {
      sportId,
      locationId,
      startsAt: '2099-11-04T01:00:00Z',
      placeName: 'Conflicting publication',
      address: '1 y 2',
      pricePerPerson: '1000',
      totalPlaces: 2,
    });
    expect(publication.status).toBe(409);
    expect(publication.body.code).toBe('PARTICIPATION_DATE_CONFLICT');
    expect(
      (
        await db.match.aggregate({
          where: { id: { in: [a, b] } },
          _sum: { availablePlaces: true },
        })
      )._sum.availablePlaces,
    ).toBe(3);
    const nextDay = await match(2, '2099-11-04T04:00:00Z');
    expect(
      (await p.browser.send('post', path(nextDay), { places: 1 })).status,
    ).toBe(201);
  });
  it('rejects own match and an organizer participation on the same local day', async () => {
    const p = await player();
    const own = await match();
    await db.match.update({ where: { id: own }, data: { organizerId: p.id } });
    await db.participation.create({
      data: {
        userId: p.id,
        matchId: own,
        role: 'ORGANIZER',
        localDate: new Date('2099-11-03'),
      },
    });
    expect(
      (await p.browser.send('post', path(own), { places: 1 })).body.code,
    ).toBe('OWN_MATCH');
    const other = await match();
    expect(
      (await p.browser.send('post', path(other), { places: 1 })).body.code,
    ).toBe('DAILY_PARTICIPATION_CONFLICT');
  });
  it('validates places, capacity, start, status, identifiers and injected identity without mutation', async () => {
    const p = await player();
    const id = await match();
    for (const places of [0, -1, 1.5, '1', 2147483648])
      expect((await p.browser.send('post', path(id), { places })).status).toBe(
        400,
      );
    expect(
      (await p.browser.send('post', path(id), { places: 3 })).body.code,
    ).toBe('MATCH_FULL');
    expect(
      (
        await p.browser.send('post', path(id), {
          places: 1,
          userId: organizerId,
        })
      ).status,
    ).toBe(400);
    for (const blocked of [
      await match(2, '2000-01-01T00:00:00Z'),
      await match(2, undefined, 'CLOSED'),
      await match(2, undefined, 'CANCELLED'),
    ]) {
      expect(
        (await p.browser.send('post', path(blocked), { places: 1 })).body.code,
      ).toBe('MATCH_UNAVAILABLE');
    }
    expect(
      (await p.browser.send('post', path(randomUUID()), { places: 1 })).status,
    ).toBe(404);
    expect(
      (await p.browser.send('post', path('bad-id'), { places: 1 })).status,
    ).toBe(400);
    expect(await db.reservation.count({ where: { userId: p.id } })).toBe(0);
    expect(
      (await db.match.findUniqueOrThrow({ where: { id } })).availablePlaces,
    ).toBe(2);
  });
  it('serializes publication against reservation for the same user and local date', async () => {
    const p = await player();
    const id = await match();
    const results = await Promise.all([
      p.browser.send('post', path(id), { places: 1 }),
      p.browser.send('post', '/matches', {
        sportId,
        locationId,
        startsAt: '2099-11-04T01:00:00Z',
        placeName: 'Publication race',
        address: '1 y 2',
        pricePerPerson: '1000',
        totalPlaces: 2,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    if (results[1].status === 201) matchIds.push(results[1].body.id);
    expect(
      await db.participation.count({ where: { userId: p.id, active: true } }),
    ).toBe(1);
    expect(
      (await db.match.findUniqueOrThrow({ where: { id } })).availablePlaces,
    ).toBe(results[0].status === 201 ? 1 : 2);
    expect(results.find((r) => r.status === 409)?.body.code).toMatch(
      /^(DAILY_PARTICIPATION_CONFLICT|PARTICIPATION_DATE_CONFLICT)$/,
    );
  });
  it('requires authentication, CSRF and trusted Origin', async () => {
    const id = await match();
    const anon = new Browser();
    await anon.prepare();
    expect((await anon.send('get', `${path(id)}/me`)).status).toBe(401);
    expect((await anon.send('post', path(id), { places: 1 })).status).toBe(401);
    const p = await player();
    expect(
      (await p.browser.send('post', path(id), { places: 1 }, false)).status,
    ).toBe(403);
    expect(
      (
        await p.browser.send(
          'post',
          path(id),
          { places: 1 },
          true,
          'https://hostile.example',
        )
      ).status,
    ).toBe(403);
  });

  it('cancels all places once, reopens, preserves private audit and reactivates the same participation', async () => {
    const p = await player();
    const id = await match(3);
    const created = (await p.browser.send('post', path(id), { places: 3 }))
      .body;
    const participation = await db.participation.findUniqueOrThrow({
      where: { userId_matchId: { userId: p.id, matchId: id } },
    });
    const cancelPath = `${path(id)}/${created.id}/cancel`;
    const results = await Promise.all(
      [1, 2].map(() => p.browser.send('post', cancelPath, {})),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    expect(results[0].headers['cache-control']).toBe('no-store');
    expect(results[0].body).toMatchObject({
      id: created.id,
      places: created.places,
      version: 2,
      status: 'CANCELLED',
      cancellationReason: null,
    });
    expect(results[0].body.cancelledAt).toBeTruthy();
    expect((await p.browser.send('get', `${path(id)}/me`)).body).toBeNull();
    expect(await db.match.findUniqueOrThrow({ where: { id } })).toMatchObject({
      availablePlaces: 3,
      status: 'OPEN',
      version: 3,
    });
    expect(
      await db.participation.findUniqueOrThrow({
        where: { id: participation.id },
      }),
    ).toMatchObject({ active: false });
    const again = await p.browser.send('post', path(id), { places: 2 });
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(created.id);
    expect(
      await db.participation.findUniqueOrThrow({
        where: { id: participation.id },
      }),
    ).toMatchObject({ active: true });
    // An old retry cannot cancel the replacement, even with another reason.
    expect((await p.browser.send('post', cancelPath, {})).body).toEqual(
      results[0].body,
    );
    expect((await p.browser.send('get', `${path(id)}/me`)).body).toEqual(
      again.body,
    );
    expect(await db.match.findUniqueOrThrow({ where: { id } })).toMatchObject({
      availablePlaces: 1,
      version: 4,
    });
    const history = await p.browser.send('get', `${path(id)}/history`);
    expect(history.headers['cache-control']).toBe('no-store');
    expect(history.body).toMatchObject({
      page: 1,
      pageSize: 3,
      total: 2,
      hasMore: false,
    });
    expect(
      history.body.items.map((item: { status: string }) => item.status),
    ).toEqual(['CONFIRMED', 'CANCELLED']);
    const other = await player();
    expect(
      (await other.browser.send('get', `${path(id)}/history`)).body.total,
    ).toBe(0);
    expect((await other.browser.send('post', cancelPath, {})).status).toBe(404);
    expect(
      (
        await p.browser.send(
          'post',
          `${path(await match())}/${created.id}/cancel`,
          {},
        )
      ).status,
    ).toBe(404);
  });

  it('releases the local date for another match and enforces it again on re-registration', async () => {
    const p = await player();
    const id = await match();
    const other = await match();
    const reservation = (await p.browser.send('post', path(id), { places: 1 }))
      .body;
    expect(
      (await p.browser.send('post', `${path(id)}/${reservation.id}/cancel`, {}))
        .status,
    ).toBe(200);
    expect(
      (await p.browser.send('post', path(other), { places: 1 })).status,
    ).toBe(201);
    expect(
      (await p.browser.send('post', path(id), { places: 1 })).body.code,
    ).toBe('DAILY_PARTICIPATION_CONFLICT');
    expect(
      await db.reservation.count({ where: { userId: p.id, matchId: id } }),
    ).toBe(1);
  });

  it('paginates private history three at a time and validates query parameters', async () => {
    const p = await player();
    const id = await match();
    for (let i = 0; i < 4; i++) {
      const reservation = (
        await p.browser.send('post', path(id), { places: 1 })
      ).body;
      expect(
        (
          await p.browser.send(
            'post',
            `${path(id)}/${reservation.id}/cancel`,
            {},
          )
        ).status,
      ).toBe(200);
    }
    const first = (await p.browser.send('get', `${path(id)}/history?page=1`))
      .body;
    const second = (await p.browser.send('get', `${path(id)}/history?page=2`))
      .body;
    expect(first).toMatchObject({ total: 4, pageSize: 3, hasMore: true });
    expect(first.items).toHaveLength(3);
    expect(second).toMatchObject({ total: 4, pageSize: 3, hasMore: false });
    expect(second.items).toHaveLength(1);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(4);
    for (const page of ['0', '-1', '1.5', '10001', 'bad'])
      expect(
        (await p.browser.send('get', `${path(id)}/history?page=${page}`))
          .status,
      ).toBe(400);
  });

  it('reuses an inactive participation with the new local date after the organizer reschedules', async () => {
    const organizer = await player();
    const p = await player();
    const id = await match();
    await db.match.update({
      where: { id },
      data: { organizerId: organizer.id },
    });
    const reservation = (await p.browser.send('post', path(id), { places: 1 }))
      .body;
    const participation = await db.participation.findUniqueOrThrow({
      where: { userId_matchId: { userId: p.id, matchId: id } },
    });
    expect(
      (await p.browser.send('post', `${path(id)}/${reservation.id}/cancel`, {}))
        .status,
    ).toBe(200);
    const row = await db.match.findUniqueOrThrow({ where: { id } });
    expect(
      (
        await organizer.browser.send('patch', `/matches/${id}`, {
          expectedVersion: row.version,
          startsAt: '2099-11-05T23:00:00Z',
        })
      ).status,
    ).toBe(200);
    expect((await p.browser.send('post', path(id), { places: 1 })).status).toBe(
      201,
    );
    expect(
      await db.participation.findUniqueOrThrow({
        where: { id: participation.id },
      }),
    ).toMatchObject({ active: true, localDate: new Date('2099-11-05') });
    expect(
      await db.reservation.count({ where: { userId: p.id, matchId: id } }),
    ).toBe(2);
    await expect(
      db.reservation.create({ data: { userId: p.id, matchId: id, places: 1 } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects invalid cancellation payloads, session, CSRF and Origin without releasing places', async () => {
    const p = await player();
    const id = await match();
    const reservation = (await p.browser.send('post', path(id), { places: 1 }))
      .body;
    const cancelPath = `${path(id)}/${reservation.id}/cancel`;
    for (const reason of [null, 1, {}, 'x'.repeat(501)])
      expect(
        (await p.browser.send('post', cancelPath, { reason })).status,
      ).toBe(400);
    expect(
      (await p.browser.send('post', cancelPath, { userId: organizerId }))
        .status,
    ).toBe(400);
    expect(
      (await p.browser.send('post', `${path(id)}/bad-id/cancel`, {})).status,
    ).toBe(400);
    expect((await p.browser.send('post', cancelPath, {}, false)).status).toBe(
      403,
    );
    expect(
      (
        await p.browser.send(
          'post',
          cancelPath,
          {},
          true,
          'https://hostile.example',
        )
      ).status,
    ).toBe(403);
    const anon = new Browser();
    await anon.prepare();
    expect((await anon.send('post', cancelPath, {})).status).toBe(401);
    expect((await anon.send('get', `${path(id)}/history`)).status).toBe(401);
    expect(
      (await db.match.findUniqueOrThrow({ where: { id } })).availablePlaces,
    ).toBe(1);
  });

  it('rejects new cancellations after start or match cancellation, but retains old idempotent results', async () => {
    for (const state of ['started', 'cancelled'] as const) {
      const p = await player();
      const id = await match();
      const reservation = (
        await p.browser.send('post', path(id), { places: 1 })
      ).body;
      await db.match.update({
        where: { id },
        data:
          state === 'started'
            ? { startsAt: new Date('2000-01-01') }
            : { status: 'CANCELLED' },
      });
      expect(
        (
          await p.browser.send(
            'post',
            `${path(id)}/${reservation.id}/cancel`,
            {},
          )
        ).body.code,
      ).toBe('RESERVATION_NOT_CANCELLABLE');
      expect(
        (
          await db.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe('CONFIRMED');
    }
    const p = await player();
    const id = await match();
    const reservation = (await p.browser.send('post', path(id), { places: 1 }))
      .body;
    const cancelled = await p.browser.send(
      'post',
      `${path(id)}/${reservation.id}/cancel`,
      {},
    );
    await db.match.update({
      where: { id },
      data: { startsAt: new Date('2000-01-01'), status: 'CANCELLED' },
    });
    expect(
      (await p.browser.send('post', `${path(id)}/${reservation.id}/cancel`, {}))
        .body,
    ).toEqual(cancelled.body);
  });

  it('rolls back capacity and participation inconsistencies', async () => {
    for (const damage of [
      'capacity',
      'participation',
      'date',
      'status',
    ] as const) {
      const p = await player();
      const id = await match();
      const reservation = (
        await p.browser.send('post', path(id), { places: 1 })
      ).body;
      if (damage === 'capacity')
        await db.match.update({ where: { id }, data: { availablePlaces: 2 } });
      if (damage === 'status')
        await db.match.update({ where: { id }, data: { status: 'CLOSED' } });
      if (damage === 'participation')
        await db.participation.updateMany({
          where: { userId: p.id, matchId: id },
          data: { active: false },
        });
      if (damage === 'date')
        await db.participation.updateMany({
          where: { userId: p.id, matchId: id },
          data: { localDate: new Date('2099-11-04') },
        });
      const before = await db.match.findUniqueOrThrow({ where: { id } });
      expect(
        (
          await p.browser.send(
            'post',
            `${path(id)}/${reservation.id}/cancel`,
            {},
          )
        ).body.code,
      ).toBe('RESERVATION_INCONSISTENT');
      expect(await db.match.findUniqueOrThrow({ where: { id } })).toEqual(
        before,
      );
      expect(
        (
          await db.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe('CONFIRMED');
    }
  });

  it('serializes cancellation against a competing reservation and leaves exact availability', async () => {
    const p = await player();
    const other = await player();
    const id = await match(2);
    const reservation = (await p.browser.send('post', path(id), { places: 2 }))
      .body;
    const [cancelled, booked] = await Promise.all([
      p.browser.send('post', `${path(id)}/${reservation.id}/cancel`, {}),
      other.browser.send('post', path(id), { places: 1 }),
    ]);
    expect(cancelled.status).toBe(200);
    expect([201, 409]).toContain(booked.status);
    const row = await db.match.findUniqueOrThrow({ where: { id } });
    expect(row.availablePlaces).toBe(booked.status === 201 ? 1 : 2);
    expect(row.status).toBe('OPEN');
    expect(
      await db.participation.count({ where: { matchId: id, active: true } }),
    ).toBe(booked.status === 201 ? 1 : 0);
  });

  it('versions capacity changes against concurrent organizer edits and enables match cancellation after all players leave', async () => {
    const organizer = await player();
    const p = await player();
    const id = await match(2);
    await db.match.update({
      where: { id },
      data: { organizerId: organizer.id },
    });
    await db.participation.create({
      data: {
        userId: organizer.id,
        matchId: id,
        role: 'ORGANIZER',
        localDate: new Date('2099-11-03'),
      },
    });
    const reservation = (await p.browser.send('post', path(id), { places: 1 }))
      .body;
    const expectedVersion = (
      await db.match.findUniqueOrThrow({ where: { id } })
    ).version;
    expect(expectedVersion).toBe(2);
    const [cancelled, edited] = await Promise.all([
      p.browser.send('post', `${path(id)}/${reservation.id}/cancel`, {}),
      organizer.browser.send('patch', `/matches/${id}`, {
        expectedVersion,
        totalPlaces: 3,
      }),
    ]);
    expect(cancelled.status).toBe(200);
    expect([200, 409]).toContain(edited.status);
    if (edited.status === 409)
      expect(edited.body.code).toBe('MATCH_VERSION_CONFLICT');
    const row = await db.match.findUniqueOrThrow({ where: { id } });
    expect(row.availablePlaces).toBe(row.totalPlaces);
    const management = await organizer.browser.send(
      'get',
      `/matches/${id}/management`,
    );
    expect(management.body).toMatchObject({
      activePlayerCount: 0,
      occupiedPlaces: 0,
      canCancel: true,
    });
    expect(
      (
        await organizer.browser.send('post', `/matches/${id}/cancel`, {
          expectedVersion: row.version,
        })
      ).status,
    ).toBe(201);
  });
  async function organized(places = 3) {
    const organizer = await player();
    const id = await match(places);
    await db.match.update({
      where: { id },
      data: { organizerId: organizer.id },
    });
    await db.participation.create({
      data: {
        userId: organizer.id,
        matchId: id,
        role: 'ORGANIZER',
        localDate: new Date('2099-11-03'),
      },
    });
    return { organizer, id };
  }
  async function cancelMatch(
    organizer: Awaited<ReturnType<typeof player>>,
    id: string,
    reason = 'Lluvia privada',
  ) {
    const { version } = await db.match.findUniqueOrThrow({ where: { id } });
    return organizer.browser.send('post', `/matches/${id}/cancel`, {
      expectedVersion: version,
      reason,
    });
  }
  it('cancels occupied matches atomically, preserves USER history and reveals match context only to affected holders', async () => {
    const { organizer, id } = await organized(4);
    const a = await player();
    const b = await player();
    const former = await player();
    const old = (await former.browser.send('post', path(id), { places: 1 }))
      .body;
    expect(
      (await former.browser.send('post', `${path(id)}/${old.id}/cancel`, {}))
        .status,
    ).toBe(200);
    await db.reservation.update({
      where: { id: old.id },
      data: { cancellationReason: 'Privado' },
    });
    const first = (await a.browser.send('post', path(id), { places: 2 })).body;
    const second = (await b.browser.send('post', path(id), { places: 2 })).body;
    const before = await db.match.findUniqueOrThrow({ where: { id } });
    expect(
      (await organizer.browser.send('get', `/matches/${id}/management`)).body
        .canCancel,
    ).toBe(true);
    expect((await cancelMatch(organizer, id)).status).toBe(201);
    const cancelled = await db.match.findUniqueOrThrow({ where: { id } });
    expect(cancelled).toMatchObject({
      availablePlaces: 4,
      totalPlaces: 4,
      status: 'CANCELLED',
      version: before.version + 1,
    });
    expect(
      await db.participation.count({ where: { matchId: id, active: true } }),
    ).toBe(0);
    for (const reservation of [first, second])
      expect(
        await db.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
        }),
      ).toMatchObject({
        status: 'CANCELLED',
        cancellationSource: 'MATCH',
        cancellationReason: null,
        cancelledAt: cancelled.cancelledAt,
      });
    expect(
      await db.reservation.findUniqueOrThrow({ where: { id: old.id } }),
    ).toMatchObject({
      cancellationSource: 'USER',
      cancellationReason: 'Privado',
    });
    const history = (await a.browser.send('get', `${path(id)}/history?page=99`))
      .body;
    expect(history.items).toEqual([]);
    expect(history.matchCancellation).toEqual({
      cancelledAt: cancelled.cancelledAt?.toISOString(),
      reason: 'Lluvia privada',
    });
    for (const holder of [former, organizer])
      expect(
        (await holder.browser.send('get', `${path(id)}/history?page=99`)).body
          .matchCancellation,
      ).toBeNull();
    expect((await a.browser.send('get', `${path(id)}/me`)).body).toBeNull();
    const retry = await a.browser.send(
      'post',
      `${path(id)}/${first.id}/cancel`,
      {},
    );
    expect(retry.status).toBe(200);
    expect(retry.body.cancellationSource).toBe('MATCH');
    expect(
      (await cancelMatch(organizer, id, 'must not overwrite')).status,
    ).toBe(201);
    expect(await db.match.findUniqueOrThrow({ where: { id } })).toEqual(
      cancelled,
    );
    expect(
      await db.matchChange.count({
        where: { matchId: id, event: 'CANCELLED' },
      }),
    ).toBe(1);
    const publicDetail = (await a.browser.send('get', `/matches/${id}`)).body;
    expect(publicDetail).not.toHaveProperty('cancellationReason');
    expect(publicDetail).not.toHaveProperty('matchCancellation');
    const next = await match();
    expect(
      (await a.browser.send('post', path(next), { places: 1 })).status,
    ).toBe(201);
  });
  it('lists each player match once, prefers confirmed reservations and includes voluntary cancellations privately', async () => {
    const p = await player();
    const first = await match();
    const old = (await p.browser.send('post', path(first), { places: 1 })).body;
    await p.browser.send('post', `${path(first)}/${old.id}/cancel`, {});
    await db.reservation.update({
      where: { id: old.id },
      data: { cancellationReason: 'Private list reason' },
    });
    const replacement = (
      await p.browser.send('post', path(first), { places: 2 })
    ).body;
    const upcoming = await p.browser.send(
      'get',
      '/users/me/matches?role=player',
    );
    expect(upcoming.headers['cache-control']).toBe('no-store');
    expect(upcoming.body).toMatchObject({ total: 1, pageSize: 9 });
    expect(upcoming.body.items[0].reservation).toEqual({
      id: replacement.id,
      places: 2,
      status: 'CONFIRMED',
      cancellationSource: null,
      cancelledAt: null,
    });
    expect(
      (
        await p.browser.send(
          'get',
          '/users/me/matches?role=player&filter=cancelled',
        )
      ).body.total,
    ).toBe(0);
    await p.browser.send('post', `${path(first)}/${replacement.id}/cancel`, {});
    const cancelled = (
      await p.browser.send(
        'get',
        '/users/me/matches?role=player&filter=cancelled',
      )
    ).body;
    expect(cancelled.total).toBe(1);
    expect(cancelled.items[0].reservation.id).toBe(replacement.id);
    expect(cancelled.items[0].reservation.cancellationSource).toBe('USER');
    expect(JSON.stringify(cancelled)).not.toContain('Private list reason');
    expect(
      (await p.browser.send('get', '/users/me/matches?role=player')).body.total,
    ).toBe(0);
    expect((await p.browser.send('get', '/users/me/matches')).body.total).toBe(
      0,
    );
    expect(
      (await p.browser.send('get', '/users/me/matches?role=invalid')).status,
    ).toBe(400);
    const other = await player();
    expect(
      (
        await other.browser.send(
          'get',
          '/users/me/matches?role=player&filter=cancelled',
        )
      ).body.total,
    ).toBe(0);
    for (let index = 0; index < 10; index++) {
      const id = await match(
        2,
        `2099-12-${String(index + 1).padStart(2, '0')}T23:00:00Z`,
      );
      expect(
        (await p.browser.send('post', path(id), { places: 1 })).status,
      ).toBe(201);
    }
    expect(
      (await p.browser.send('get', '/users/me/matches?role=player')).body.items,
    ).toHaveLength(9);
    expect(
      (await p.browser.send('get', '/users/me/matches?role=player&page=2'))
        .body,
    ).toMatchObject({ total: 10, page: 2, hasMore: false });
    const onePast = (
      await p.browser.send('get', '/users/me/matches?role=player&page=2')
    ).body.items[0].id;
    await db.match.update({
      where: { id: onePast },
      data: { startsAt: new Date('2000-01-01') },
    });
    expect(
      (await p.browser.send('get', '/users/me/matches?role=player&filter=past'))
        .body.total,
    ).toBe(1);
  });
  it('rolls back bulk cancellation when reservations, players, capacity or organizer participation disagree', async () => {
    for (const damage of [
      'capacity',
      'missingPlayer',
      'wrongPlayerDate',
      'missingOrganizer',
      'wrongOrganizerDate',
      'orphanPlayer',
    ]) {
      const { organizer, id } = await organized();
      const p = await player();
      expect(
        (await p.browser.send('post', path(id), { places: 1 })).status,
      ).toBe(201);
      if (damage === 'capacity')
        await db.match.update({ where: { id }, data: { availablePlaces: 3 } });
      if (damage === 'missingPlayer')
        await db.participation.updateMany({
          where: { matchId: id, userId: p.id },
          data: { active: false },
        });
      if (damage === 'wrongPlayerDate')
        await db.participation.updateMany({
          where: { matchId: id, userId: p.id },
          data: { localDate: new Date('2099-11-04') },
        });
      if (damage === 'missingOrganizer')
        await db.participation.updateMany({
          where: { matchId: id, userId: organizer.id },
          data: { active: false },
        });
      if (damage === 'wrongOrganizerDate')
        await db.participation.updateMany({
          where: { matchId: id, userId: organizer.id },
          data: { localDate: new Date('2099-11-04') },
        });
      if (damage === 'orphanPlayer')
        await db.reservation.deleteMany({ where: { matchId: id } });
      const before = await db.match.findUniqueOrThrow({ where: { id } });
      const reservations = await db.reservation.findMany({
        where: { matchId: id },
      });
      const participants = await db.participation.findMany({
        where: { matchId: id },
      });
      expect((await cancelMatch(organizer, id)).body.code).toBe(
        'MATCH_CANCELLATION_INCONSISTENT',
      );
      expect(await db.match.findUniqueOrThrow({ where: { id } })).toEqual(
        before,
      );
      expect(await db.reservation.findMany({ where: { matchId: id } })).toEqual(
        reservations,
      );
      expect(
        await db.participation.findMany({ where: { matchId: id } }),
      ).toEqual(participants);
      expect(await db.matchChange.count({ where: { matchId: id } })).toBe(0);
      // Independent fixture groups need independent real-login quota.
      app
        .get<ThrottlerStorageService>(getStorageToken())
        .onApplicationShutdown();
    }
  });
  it('serializes organizer cancellation against booking, individual cancellation, capacity edits and another cancellation', async () => {
    for (const competing of ['reserve', 'cancel', 'edit', 'bulk']) {
      const { organizer, id } = await organized();
      const p = await player();
      const other = await player();
      const reservation = (
        await p.browser.send('post', path(id), { places: 1 })
      ).body;
      const before = await db.match.findUniqueOrThrow({ where: { id } });
      const bulkBody = {
        expectedVersion: before.version,
        reason: 'First winner',
      };
      const concurrent =
        competing === 'reserve'
          ? other.browser.send('post', path(id), { places: 1 })
          : competing === 'cancel'
            ? p.browser.send('post', `${path(id)}/${reservation.id}/cancel`, {})
            : competing === 'edit'
              ? organizer.browser.send('patch', `/matches/${id}`, {
                  expectedVersion: before.version,
                  totalPlaces: 4,
                })
              : organizer.browser.send(
                  'post',
                  `/matches/${id}/cancel`,
                  bulkBody,
                );
      const [bulk, operation] = await Promise.all([
        organizer.browser.send('post', `/matches/${id}/cancel`, bulkBody),
        concurrent,
      ]);
      expect([201, 409]).toContain(bulk.status);
      expect([200, 201, 409]).toContain(operation.status);
      if (bulk.status === 409)
        expect(bulk.body.code).toBe('MATCH_VERSION_CONFLICT');
      if (
        (await db.match.findUniqueOrThrow({ where: { id } })).status !==
        'CANCELLED'
      )
        expect((await cancelMatch(organizer, id)).status).toBe(201);
      const after = await db.match.findUniqueOrThrow({ where: { id } });
      expect(after.availablePlaces).toBe(after.totalPlaces);
      expect(after.status).toBe('CANCELLED');
      expect(
        await db.reservation.count({
          where: { matchId: id, status: 'CONFIRMED' },
        }),
      ).toBe(0);
      expect(
        await db.participation.count({ where: { matchId: id, active: true } }),
      ).toBe(0);
      expect(
        await db.matchChange.count({
          where: { matchId: id, event: 'CANCELLED' },
        }),
      ).toBe(1);
      app
        .get<ThrottlerStorageService>(getStorageToken())
        .onApplicationShutdown();
    }
  });
  it.each(['reservation', 'publication'] as const)(
    'serializes bulk cancellation against an affected player %s on another match on the same local date',
    async (operation) => {
      const { organizer, id } = await organized();
      const p = await player();
      const target = await match();
      expect(
        (await p.browser.send('post', path(id), { places: 1 })).status,
      ).toBe(201);
      const version = (await db.match.findUniqueOrThrow({ where: { id } }))
        .version;
      const publish = (owner: typeof p) =>
        owner.browser.send('post', '/matches', {
          sportId,
          locationId,
          startsAt: '2099-11-03T23:00:00Z',
          placeName: 'Cross-match race',
          address: '1 y 2',
          pricePerPerson: '1000',
          totalPlaces: 2,
        });
      const compete = () =>
        operation === 'reservation'
          ? p.browser.send('post', path(target), { places: 1 })
          : publish(p);
      const [cancelled, attempt] = await Promise.all([
        organizer.browser.send('post', `/matches/${id}/cancel`, {
          expectedVersion: version,
        }),
        compete(),
      ]);
      expect(cancelled.status).toBe(201);
      expect([201, 409]).toContain(attempt.status);
      if (attempt.status === 409)
        expect(attempt.body.code).toBe(
          operation === 'reservation'
            ? 'DAILY_PARTICIPATION_CONFLICT'
            : 'PARTICIPATION_DATE_CONFLICT',
        );
      const confirmed = attempt.status === 201 ? attempt : await compete();
      expect(confirmed.status).toBe(201);
      if (operation === 'publication') matchIds.push(confirmed.body.id);
      const destination =
        operation === 'reservation' ? target : confirmed.body.id;
      const active = await db.participation.findMany({
        where: { userId: p.id, active: true },
      });
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        matchId: destination,
        role: operation === 'reservation' ? 'PLAYER' : 'ORGANIZER',
        localDate: new Date('2099-11-03'),
      });
      expect(
        await db.participation.count({ where: { matchId: id, active: true } }),
      ).toBe(0);
      expect(
        await db.reservation.count({
          where: { matchId: id, status: 'CONFIRMED' },
        }),
      ).toBe(0);
      // The same atomic cancellation also releases the organizer's local date.
      const reorganized = await publish(organizer);
      expect(reorganized.status).toBe(201);
      matchIds.push(reorganized.body.id);
      expect(
        await db.participation.count({
          where: { userId: organizer.id, active: true },
        }),
      ).toBe(1);
      expect(
        await db.matchChange.count({
          where: { matchId: id, event: 'CANCELLED' },
        }),
      ).toBe(1);
    },
  );
});

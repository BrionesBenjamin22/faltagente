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
      'places',
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
      [1, 2].map(() =>
        p.browser.send('post', cancelPath, { reason: '  Cambio de planes  ' }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    expect(results[0].headers['cache-control']).toBe('no-store');
    expect(results[0].body).toMatchObject({
      ...created,
      status: 'CANCELLED',
      cancellationReason: 'Cambio de planes',
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
    expect(
      (await p.browser.send('post', cancelPath, { reason: 'Changed retry' }))
        .body,
    ).toEqual(results[0].body);
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
});

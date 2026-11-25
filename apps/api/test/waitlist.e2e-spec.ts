import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';
import { EmailService } from '../src/auth/email.service.js';
import { isolatedDatabaseUrl } from './isolated-database.js';
import { WaitlistService } from '../src/waitlist/waitlist.service.js';
import { WaitlistEventsService } from '../src/waitlist/waitlist-events.service.js';

describe(
  'waitlist transactional API against PostgreSQL',
  { timeout: 120000 },
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let locationId: string;
    let sportId: string;
    let day = 1;
    const actors: { id: string; browser: Browser }[] = [];
    const auxiliaryUserIds: string[] = [];
    const matches: string[] = [];
    const password = 'Waitlist integration 123!';
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
          const [key, value] = cookie.split(';')[0].split('=');
          if (value) this.cookies.set(key, value);
          else this.cookies.delete(key);
        }
        return res;
      }
      async prepare() {
        this.csrf = (await this.send('get', '/auth/csrf')).body.csrfToken;
      }
    }
    const path = (id: string) => `/matches/${id}/waitlist`;
    const offerPath = (id: string) => `/waitlist/offers/${id}`;
    async function fixture(
      total = 3,
      date?: Date,
      owner = actors[0],
      holder = actors[1],
    ) {
      const startsAt = date ?? new Date(Date.UTC(2098, 1, day++, 22));
      const [{ localDate }] = await db.$queryRaw<
        { localDate: Date }[]
      >`SELECT (${startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"`;
      const row = await db.match.create({
        data: {
          organizerId: owner.id,
          locationId,
          sportId,
          startsAt,
          venueName: 'Waitlist integration court',
          address: '1 y 60',
          pricePerPerson: 1000,
          totalPlaces: total,
          availablePlaces: 0,
          status: 'CLOSED',
          participations: {
            create: [
              { userId: owner.id, localDate, role: 'ORGANIZER' },
              { userId: holder.id, localDate, role: 'PLAYER' },
            ],
          },
          reservations: { create: { userId: holder.id, places: total } },
        },
        include: { reservations: true },
      });
      matches.push(row.id);
      return { ...row, owner, holder };
    }
    async function join(matchId: string, actor = actors[2], places = 1) {
      const res = await actor.browser.send('post', path(matchId), { places });
      expect(res.status).toBe(201);
      return res.body as { id: string; createdAt: string };
    }
    async function release(row: Awaited<ReturnType<typeof fixture>>) {
      const res = await row.holder.browser.send(
        'post',
        `/matches/${row.id}/reservations/${row.reservations[0].id}/cancel`,
        {},
      );
      expect(res.status).toBe(200);
    }
    async function own(matchId: string, actor = actors[2]) {
      const res = await actor.browser.send('get', `${path(matchId)}/me`);
      expect(res.status).toBe(200);
      return res.body;
    }
    async function invariant(matchId: string) {
      const match = await db.match.findUniqueOrThrow({
        where: { id: matchId },
      });
      const confirmed = await db.reservation.aggregate({
        where: { matchId, status: 'CONFIRMED' },
        _sum: { places: true },
      });
      const held = await db.waitlistOffer.aggregate({
        where: { entry: { matchId }, status: 'PENDING' },
        _sum: { places: true },
      });
      expect(
        (confirmed._sum.places ?? 0) +
          (held._sum.places ?? 0) +
          match.availablePlaces,
      ).toBe(match.totalPlaces);
      expect(match.availablePlaces).toBeGreaterThanOrEqual(0);
    }
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
          data: { name: `Waitlist ${randomUUID()}`, type: 'LOCALIDAD' },
        })
      ).id;
      sportId = (
        await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } })
      ).id;
      const passwordHash = await argon2.hash(password);
      for (let i = 0; i < 7; i++) {
        const user = await db.user.create({
          data: {
            name: `Waitlist actor ${i}`,
            email: `waitlist-${randomUUID()}@example.test`,
            passwordHash,
            primaryLocationId: locationId,
          },
        });
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
        actors.push({ id: user.id, browser });
        app
          .get<ThrottlerStorageService>(getStorageToken())
          .onApplicationShutdown();
      }
    });
    beforeEach(() => {
      app
        .get<ThrottlerStorageService>(getStorageToken())
        .onApplicationShutdown();
    });
    afterAll(async () => {
      if (db) {
        await db.waitlistEvent.deleteMany({
          where: { matchId: { in: matches } },
        });
        await db.waitlistOffer.deleteMany({
          where: { entry: { matchId: { in: matches } } },
        });
        await db.waitlistEntry.deleteMany({
          where: { matchId: { in: matches } },
        });
        await db.reservation.deleteMany({
          where: { matchId: { in: matches } },
        });
        await db.matchChange.deleteMany({
          where: { matchId: { in: matches } },
        });
        await db.participation.deleteMany({
          where: { matchId: { in: matches } },
        });
        await db.match.deleteMany({ where: { id: { in: matches } } });
        await db.user.deleteMany({
          where: {
            id: { in: [...actors.map((a) => a.id), ...auxiliaryUserIds] },
          },
        });
        await db.location.delete({ where: { id: locationId } });
      }
      await app?.close();
    });
    it('requires session, CSRF, origin, ownership and valid quantity without leaking contact', async () => {
      const match = await fixture();
      const anonymous = new Browser();
      await anonymous.prepare();
      expect((await anonymous.send('get', `${path(match.id)}/me`)).status).toBe(
        401,
      );
      expect(
        (await anonymous.send('post', path(match.id), { places: 1 })).status,
      ).toBe(401);
      expect(
        (
          await actors[2].browser.send(
            'post',
            path(match.id),
            { places: 1 },
            false,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await actors[2].browser.send(
            'post',
            path(match.id),
            { places: 1 },
            true,
            'https://untrusted.test',
          )
        ).status,
      ).toBe(403);
      for (const places of [0, -1, 1.5, '1'])
        expect(
          (await actors[2].browser.send('post', path(match.id), { places }))
            .status,
        ).toBe(400);
      expect(
        (await actors[2].browser.send('post', path(match.id), { places: 4 }))
          .status,
      ).toBe(409);
      expect(
        (await actors[0].browser.send('post', path(match.id), { places: 1 }))
          .status,
      ).toBe(409);
      const entry = await join(match.id);
      const list = await actors[0].browser.send('get', path(match.id));
      expect(list.status).toBe(200);
      expect(list.headers['cache-control']).toBe('no-store');
      expect(list.body).toMatchObject({ total: 1, pageSize: 9 });
      expect(list.body.items[0]).toMatchObject({ id: entry.id, places: 1 });
      expect(JSON.stringify(list.body)).not.toMatch(
        /email|password|phone|token/i,
      );
      expect((await actors[3].browser.send('get', path(match.id))).status).toBe(
        403,
      );
      expect(
        (
          await actors[3].browser.send(
            'post',
            `${path(match.id)}/${entry.id}/leave`,
          )
        ).status,
      ).toBe(404);
      expect(await own(match.id, actors[3])).toBeNull();
    });
    it('deduplicates joins, preserves old leave retries and grants new seniority on rejoin', async () => {
      const match = await fixture();
      const [a, b] = await Promise.all([join(match.id), join(match.id)]);
      expect(a.id).toBe(b.id);
      expect(
        (await actors[2].browser.send('post', path(match.id), { places: 2 }))
          .status,
      ).toBe(409);
      expect(
        (
          await actors[2].browser.send(
            'post',
            `${path(match.id)}/${a.id}/leave`,
          )
        ).status,
      ).toBe(200);
      const replacement = await join(match.id);
      expect(replacement.id).not.toBe(a.id);
      expect(new Date(replacement.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(a.createdAt).getTime(),
      );
      expect(
        (
          await actors[2].browser.send(
            'post',
            `${path(match.id)}/${a.id}/leave`,
          )
        ).status,
      ).toBe(200);
      expect((await own(match.id)).id).toBe(replacement.id);
      expect(
        await db.waitlistEvent.count({
          where: { entryId: a.id, type: 'ENTRY_LEFT' },
        }),
      ).toBeLessThanOrEqual(1);
    });
    it('uses best fit then seniority, holds multiple offers and blocks ordinary booking', async () => {
      const match = await fixture(3);
      await join(match.id, actors[2], 1);
      await join(match.id, actors[3], 2);
      await join(match.id, actors[4], 2);
      await release(match);
      const first = await own(match.id, actors[2]);
      const best = await own(match.id, actors[3]);
      const next = await own(match.id, actors[4]);
      expect(first.status).toBe('OFFERED');
      expect(best.status).toBe('OFFERED');
      expect(next.status).toBe('WAITING');
      expect(
        new Date(best.offer.expiresAt).getTime() -
          new Date(best.createdAt).getTime(),
      ).toBeLessThanOrEqual(901000);
      expect(
        (
          await actors[5].browser.send(
            'post',
            `/matches/${match.id}/reservations`,
            { places: 1 },
          )
        ).status,
      ).toBe(409);
      const management = (
        await actors[0].browser.send('get', `/matches/${match.id}/management`)
      ).body;
      expect(management).toMatchObject({
        occupiedPlaces: 0,
        heldPlaces: 3,
        availablePlaces: 0,
        hasActiveWaitlist: true,
      });
      await invariant(match.id);
      expect(
        (
          await actors[3].browser.send(
            'post',
            `${offerPath(best.offer.id)}/reject`,
          )
        ).status,
      ).toBe(200);
      expect((await own(match.id, actors[4])).status).toBe('OFFERED');
      expect(
        (
          await actors[3].browser.send(
            'post',
            `${offerPath(best.offer.id)}/reject`,
          )
        ).status,
      ).toBe(200);
      await invariant(match.id);
    });
    it('accepts once under concurrency and never recreates a canceled accepted reservation', async () => {
      const match = await fixture(2);
      await join(match.id, actors[2], 2);
      await release(match);
      const offer = (await own(match.id)).offer;
      expect(
        (await actors[3].browser.send('post', `${offerPath(offer.id)}/accept`))
          .status,
      ).toBe(404);
      const [a, b] = await Promise.all([
        actors[2].browser.send('post', `${offerPath(offer.id)}/accept`),
        actors[2].browser.send('post', `${offerPath(offer.id)}/accept`),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.id).toBe(b.body.id);
      expect(
        await db.reservation.count({
          where: { matchId: match.id, userId: actors[2].id },
        }),
      ).toBe(1);
      expect(
        await db.participation.count({
          where: { matchId: match.id, userId: actors[2].id, active: true },
        }),
      ).toBe(1);
      await invariant(match.id);
      expect(
        (
          await actors[2].browser.send(
            'post',
            `/matches/${match.id}/reservations/${a.body.id}/cancel`,
            {},
          )
        ).status,
      ).toBe(200);
      const retry = await actors[2].browser.send(
        'post',
        `${offerPath(offer.id)}/accept`,
      );
      expect(retry.status).toBe(200);
      expect(retry.body.id).toBe(a.body.id);
      expect(
        await db.reservation.count({
          where: {
            matchId: match.id,
            userId: actors[2].id,
            status: 'CONFIRMED',
          },
        }),
      ).toBe(0);
      await invariant(match.id);
    });
    it('atomically invalidates competing offers after accepting on the same local day', async () => {
      const a = await fixture(1);
      const b = await fixture(1, a.startsAt, actors[6], actors[5]);
      await join(a.id);
      await join(b.id);
      await release(a);
      expect(
        (
          await actors[5].browser.send(
            'post',
            `/matches/${b.id}/reservations/${b.reservations[0].id}/cancel`,
            {},
          )
        ).status,
      ).toBe(200);
      const one = (await own(a.id)).offer;
      const two = (await own(b.id)).offer;
      const results = await Promise.all([
        actors[2].browser.send('post', `${offerPath(one.id)}/accept`),
        actors[2].browser.send('post', `${offerPath(two.id)}/accept`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await db.participation.count({
          where: {
            userId: actors[2].id,
            active: true,
            matchId: { in: [a.id, b.id] },
          },
        }),
      ).toBe(1);
      expect(
        await db.waitlistOffer.count({
          where: {
            entry: { userId: actors[2].id, matchId: { in: [a.id, b.id] } },
            status: 'PENDING',
          },
        }),
      ).toBe(0);
      await invariant(a.id);
      await invariant(b.id);
    });
    it('blocks critical editing, protects held capacity and invalidates all requests on cancellation', async () => {
      const match = await fixture(2);
      await join(match.id);
      await release(match);
      let current = await db.match.findUniqueOrThrow({
        where: { id: match.id },
      });
      expect(
        (
          await actors[0].browser.send('patch', `/matches/${match.id}`, {
            expectedVersion: current.version,
            address: 'Changed address',
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await actors[0].browser.send('patch', `/matches/${match.id}`, {
            expectedVersion: current.version,
            totalPlaces: 0,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await actors[0].browser.send('patch', `/matches/${match.id}`, {
            expectedVersion: current.version,
            description: 'Noncritical description',
            totalPlaces: 3,
          })
        ).status,
      ).toBe(200);
      current = await db.match.findUniqueOrThrow({ where: { id: match.id } });
      const offer = (await own(match.id)).offer;
      expect(
        (
          await actors[0].browser.send('post', `/matches/${match.id}/cancel`, {
            expectedVersion: current.version,
          })
        ).status,
      ).toBe(201);
      expect(
        (await actors[2].browser.send('post', `${offerPath(offer.id)}/accept`))
          .status,
      ).toBe(409);
      expect(
        await db.waitlistOffer.count({
          where: { entry: { matchId: match.id }, status: 'PENDING' },
        }),
      ).toBe(0);
      expect(
        await db.waitlistEntry.count({
          where: { matchId: match.id, status: { in: ['WAITING', 'OFFERED'] } },
        }),
      ).toBe(0);
      await invariant(match.id);
    });
    it('derives expiry without GET writes, persists expiry on rejected acceptance and reassigns', async () => {
      const match = await fixture(1);
      await join(match.id);
      await join(match.id, actors[3]);
      await release(match);
      const offer = (await own(match.id)).offer;
      await db.waitlistOffer.update({
        where: { id: offer.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const events = await db.waitlistEvent.count({
        where: { matchId: match.id },
      });
      expect((await own(match.id)).offer.status).toBe('EXPIRED');
      expect(
        (await db.waitlistOffer.findUniqueOrThrow({ where: { id: offer.id } }))
          .status,
      ).toBe('PENDING');
      expect(
        await db.waitlistEvent.count({ where: { matchId: match.id } }),
      ).toBe(events);
      expect(
        (await actors[2].browser.send('post', `${offerPath(offer.id)}/accept`))
          .status,
      ).toBe(409);
      expect(
        (await db.waitlistOffer.findUniqueOrThrow({ where: { id: offer.id } }))
          .status,
      ).toBe('EXPIRED');
      expect((await own(match.id, actors[3])).status).toBe('OFFERED');
      await Promise.all([
        app.get(WaitlistService).expireDue(),
        app.get(WaitlistService).expireDue(),
      ]);
      await invariant(match.id);
    });
    it.each(['reservation', 'publication'] as const)(
      'invalidates same-day holds atomically after direct %s',
      async (operation) => {
        const a = await fixture(1);
        await join(a.id);
        await join(a.id, actors[3]);
        await release(a);
        const offer = (await own(a.id)).offer;
        let destination: string;
        if (operation === 'reservation') {
          const b = await fixture(
            1,
            new Date(a.startsAt.getTime() + 3 * 3600000),
            actors[6],
            actors[5],
          );
          await release(b);
          const res = await actors[2].browser.send(
            'post',
            `/matches/${b.id}/reservations`,
            { places: 1 },
          );
          expect(res.status).toBe(201);
          destination = b.id;
          await invariant(b.id);
        } else {
          const res = await actors[2].browser.send('post', '/matches', {
            sportId,
            locationId,
            startsAt: new Date(
              a.startsAt.getTime() + 3 * 3600000,
            ).toISOString(),
            placeName: 'Published after waiting',
            address: '1 y 61',
            pricePerPerson: '1000',
            totalPlaces: 2,
          });
          expect(res.status).toBe(201);
          destination = res.body.id;
          matches.push(destination);
        }
        expect(
          (
            await db.waitlistOffer.findUniqueOrThrow({
              where: { id: offer.id },
            })
          ).status,
        ).toBe('INVALIDATED');
        expect((await own(a.id, actors[3])).status).toBe('OFFERED');
        const active = await db.participation.findMany({
          where: {
            userId: actors[2].id,
            matchId: { in: [a.id, destination] },
            active: true,
          },
        });
        expect(active).toHaveLength(1);
        expect(active[0].matchId).toBe(destination);
        await invariant(a.id);
      },
    );
    it('bounds offers to match start and expires waiting requests once play begins', async () => {
      const match = await fixture(1, new Date(Date.now() + 120000));
      await join(match.id);
      await join(match.id, actors[3]);
      await release(match);
      const offer = (await own(match.id)).offer;
      expect(new Date(offer.expiresAt).getTime()).toBe(
        match.startsAt.getTime(),
      );
      await db.match.update({
        where: { id: match.id },
        data: { startsAt: new Date(Date.now() - 1000) },
      });
      await app.get(WaitlistService).expireDue();
      expect(
        await db.waitlistEntry.count({
          where: { matchId: match.id, status: { in: ['WAITING', 'OFFERED'] } },
        }),
      ).toBe(0);
      expect(
        (await actors[2].browser.send('post', `${offerPath(offer.id)}/accept`))
          .status,
      ).toBe(409);
      await invariant(match.id);
    });
    it('rolls back capacity, entries and events if cancellation invariants fail', async () => {
      const match = await fixture(2);
      await join(match.id);
      await db.match.update({
        where: { id: match.id },
        data: { availablePlaces: 1, status: 'OPEN' },
      });
      const events = await db.waitlistEvent.findMany({
        where: { matchId: match.id },
      });
      const before = await db.waitlistEntry.findMany({
        where: { matchId: match.id },
      });
      expect(
        (
          await actors[1].browser.send(
            'post',
            `/matches/${match.id}/reservations/${match.reservations[0].id}/cancel`,
            {},
          )
        ).status,
      ).toBe(409);
      expect(
        await db.waitlistEntry.findMany({ where: { matchId: match.id } }),
      ).toEqual(before);
      expect(
        await db.waitlistEvent.findMany({ where: { matchId: match.id } }),
      ).toEqual(events);
      expect(
        (
          await db.reservation.findUniqueOrThrow({
            where: { id: match.reservations[0].id },
          })
        ).status,
      ).toBe('CONFIRMED');
    });
    it('makes expiry progress over multiple bounded worker batches', async () => {
      const match = await fixture(1);
      const users = Array.from({ length: 205 }, () => ({
        id: randomUUID(),
        name: 'Batch waiter',
        email: `batch-${randomUUID()}@example.test`,
      }));
      auxiliaryUserIds.push(...users.map((user) => user.id));
      await db.user.createMany({ data: users });
      await db.waitlistEntry.createMany({
        data: users.map((user) => ({
          userId: user.id,
          matchId: match.id,
          places: 1,
        })),
      });
      await db.match.update({
        where: { id: match.id },
        data: { startsAt: new Date('2001-01-01T22:00:00Z') },
      });
      await app.get(WaitlistService).expireDue();
      expect(
        await db.waitlistEntry.count({
          where: { matchId: match.id, status: 'WAITING' },
        }),
      ).toBeLessThanOrEqual(5);
      await app.get(WaitlistService).expireDue();
      expect(
        await db.waitlistEntry.count({
          where: { matchId: match.id, status: 'WAITING' },
        }),
      ).toBe(0);
      expect(
        await db.waitlistEntry.count({
          where: { matchId: match.id, status: 'EXPIRED' },
        }),
      ).toBe(205);
    });
    it('provides versioned internal cursor events without duplicate records on retry', async () => {
      const match = await fixture(1);
      const reader = app.get(WaitlistEventsService);
      const latest = await db.waitlistEvent.findFirst({
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const start = latest?.sequence.toString() ?? '0';
      const [entry] = await Promise.all([
        join(match.id),
        join(match.id, actors[3]),
      ]);
      await release(match);
      const offer = (await own(match.id)).offer;
      expect(
        (await actors[2].browser.send('post', `${offerPath(offer.id)}/accept`))
          .status,
      ).toBe(200);
      const count = await db.waitlistEvent.count({
        where: { entryId: entry.id },
      });
      expect(
        (await actors[2].browser.send('post', `${offerPath(offer.id)}/accept`))
          .status,
      ).toBe(200);
      expect(
        await db.waitlistEvent.count({ where: { entryId: entry.id } }),
      ).toBe(count);
      const events = await reader.readAfter(start, 500);
      const ownEvents = events.items.filter(
        (event) => event.entryId === entry.id,
      );
      expect(ownEvents.map((event) => event.type)).toEqual([
        'ENTRY_JOINED',
        'OFFER_CREATED',
        'OFFER_ACCEPTED',
        'ENTRY_COMPLETED',
      ]);
      expect(
        ownEvents.every(
          (event) =>
            event.schemaVersion === 1 && event.recipientId === actors[2].id,
        ),
      ).toBe(true);
      expect(new Set(events.items.map((event) => event.id)).size).toBe(
        events.items.length,
      );
      const page = await reader.readAfter(start, 1);
      const next = await reader.readAfter(page.nextCursor, 500);
      expect(next.items.map((event) => event.id)).not.toContain(
        page.items[0].id,
      );
      expect(JSON.stringify(events)).not.toMatch(
        /password|email|cookie|token/i,
      );
      expect(
        (await actors[2].browser.send('get', '/waitlist/events')).status,
      ).toBe(404);
      await expect(reader.readAfter('-1')).rejects.toThrow(RangeError);
      await expect(reader.readAfter('0', 501)).rejects.toThrow(RangeError);
    });
  },
);

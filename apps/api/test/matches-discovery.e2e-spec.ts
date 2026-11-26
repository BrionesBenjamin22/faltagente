import { isolatedDatabaseUrl } from './isolated-database.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';

describe('public multisport discovery filters', () => {
  let app: INestApplication;
  let db: PrismaService;
  let locationId: string;
  let otherLocationId: string;
  let organizerId: string;
  let sportId: string;
  let otherSportId: string;
  let formatId: string;
  let otherFormatId: string;
  let secondFormatId: string;
  const day = '2099-11-03';
  const dayFormatMatches: string[] = [];
  let otherDayMatchId: string;
  let secondFormatMatchId: string;
  let otherSportMatchId: string;
  let nullFormatMatchId: string;
  const get = (filters: Record<string, string | number | undefined> = {}) =>
    request(app.getHttpServer()).get('/api/v1/matches').query({ locationId, ...filters });

  beforeAll(async () => {
    isolatedDatabaseUrl(process.env.DATABASE_URL);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    const suffix = randomUUID();
    locationId = (await db.location.create({ data: { name: `Discovery ${suffix}`, type: 'LOCALIDAD' } })).id;
    otherLocationId = (await db.location.create({ data: { name: `Other discovery ${suffix}`, type: 'LOCALIDAD' } })).id;
    organizerId = (await db.user.create({ data: { name: 'Discovery organizer', email: `discovery-${suffix}@example.test` } })).id;
    sportId = (await db.sport.create({ data: { name: 'Discovery football', slug: `discovery-football-${suffix}` } })).id;
    otherSportId = (await db.sport.create({ data: { name: 'Discovery padel', slug: `discovery-padel-${suffix}`, active: false } })).id;
    formatId = (await db.sportFormat.create({ data: { sportId, name: 'Discovery five', slug: 'five' } })).id;
    secondFormatId = (await db.sportFormat.create({ data: { sportId, name: 'Discovery six', slug: 'six' } })).id;
    otherFormatId = (await db.sportFormat.create({ data: { sportId: otherSportId, name: 'Discovery doubles', slug: 'doubles', active: false } })).id;
    const base = { organizerId, locationId, sportId, sportFormatId: formatId, venueName: 'Discovery fixture', address: 'Fixture address', pricePerPerson: 0, totalPlaces: 2, availablePlaces: 2 };
    // Include midnight exactly, its last millisecond, and enough results to paginate.
    const times = ['2099-11-03T03:00:00.000Z', ...Array.from({ length: 9 }, (_, index) => `2099-11-03T${String(index + 4).padStart(2, '0')}:00:00.000Z`), '2099-11-04T02:59:59.999Z'];
    for (const startsAt of times) {
      dayFormatMatches.push((await db.match.create({ data: { ...base, startsAt: new Date(startsAt) } })).id);
    }
    otherDayMatchId = (await db.match.create({ data: { ...base, startsAt: new Date('2099-11-03T02:59:59.999Z') } })).id;
    secondFormatMatchId = (await db.match.create({ data: { ...base, sportFormatId: secondFormatId, startsAt: new Date('2099-11-03T15:00:00Z'), status: 'CLOSED' } })).id;
    otherSportMatchId = (await db.match.create({ data: { ...base, sportId: otherSportId, sportFormatId: otherFormatId, startsAt: new Date('2099-11-03T16:00:00Z') } })).id;
    nullFormatMatchId = (await db.match.create({ data: { ...base, sportFormatId: null, startsAt: new Date('2099-11-03T17:00:00Z') } })).id;
    await db.match.createMany({ data: [
      { ...base, startsAt: new Date('2099-11-04T03:00:00Z') },
      { ...base, locationId: otherLocationId, startsAt: new Date('2099-11-03T10:00:00Z') },
      { ...base, status: 'CANCELLED', startsAt: new Date('2099-11-03T10:00:00Z') },
      { ...base, startsAt: new Date('2000-01-01T10:00:00Z') },
    ] });
  });

  afterAll(async () => {
    if (db) {
      await db.match.deleteMany({ where: { locationId: { in: [locationId, otherLocationId].filter(Boolean) } } });
      if (organizerId) await db.user.deleteMany({ where: { id: organizerId } });
      await db.location.deleteMany({ where: { id: { in: [locationId, otherLocationId].filter(Boolean) } } });
      await db.sportFormat.deleteMany({ where: { sportId: { in: [sportId, otherSportId].filter(Boolean) } } });
      await db.sport.deleteMany({ where: { id: { in: [sportId, otherSportId].filter(Boolean) } } });
    }
    await app?.close();
  });

  it('preserves location-only discovery, public states, future rule and nine-result pagination', async () => {
    const first = await get().expect(200);
    const second = await get({ page: 2 }).expect(200);
    expect(first.body).toMatchObject({ total: 16, page: 1, pageSize: 9, hasMore: true });
    expect(second.body).toMatchObject({ total: 16, page: 2, pageSize: 9, hasMore: false });
    const items = [...first.body.items, ...second.body.items] as { id: string; startsAt: string; status: string }[];
    expect(new Set(items.map(item => item.id)).size).toBe(16);
    expect(items[0].id).toBe(otherDayMatchId);
    expect(items.some(item => item.id === secondFormatMatchId && item.status === 'CLOSED')).toBe(true);
    expect(items.map(item => item.startsAt)).toEqual(items.map(item => item.startsAt).sort());
  });

  it('lists every locality without a location filter in chronological order', async () => {
    const filters = { locationId: undefined, sportId };
    const first = await get(filters).expect(200);
    const second = await get({ ...filters, page: 2 }).expect(200);
    const items = [...first.body.items, ...second.body.items] as { id: string; location: { id: string }; startsAt: string }[];
    expect(first.body).toMatchObject({ total: 16, pageSize: 9, hasMore: true });
    expect(second.body).toMatchObject({ total: 16, hasMore: false });
    expect(new Set(items.map(item => item.location.id))).toEqual(new Set([locationId, otherLocationId]));
    expect(new Set(items.map(item => item.id)).size).toBe(16);
    const expected = await db.match.findMany({
      where: { sportId, status: { in: ['OPEN', 'CLOSED'] }, startsAt: { gt: new Date() }, location: { active: true } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], select: { id: true },
    });
    expect(items.map(item => item.id)).toEqual(expected.map(item => item.id));
  });

  it('prioritizes a locality across pages before chronologically ordered other localities', async () => {
    const filters = { locationId: undefined, preferredLocationId: locationId, sportId };
    const first = await get(filters).expect(200);
    const second = await get({ ...filters, page: 2 }).expect(200);
    expect(first.body).toMatchObject({ total: 16, pageSize: 9, hasMore: true });
    expect(second.body).toMatchObject({ total: 16, hasMore: false });
    expect(first.body.items).toHaveLength(9);
    expect(first.body.items.every((item: { location: { id: string } }) => item.location.id === locationId)).toBe(true);
    expect(second.body.items.slice(0, 6).every((item: { location: { id: string } }) => item.location.id === locationId)).toBe(true);
    expect(second.body.items[6].location.id).toBe(otherLocationId);
    const items = [...first.body.items, ...second.body.items];
    expect(new Set(items.map(item => item.id)).size).toBe(16);
    const preferredDates = items.slice(0, 15).map(item => item.startsAt);
    expect(preferredDates).toEqual([...preferredDates].sort());
    // The earliest non-local match still follows the last preferred match.
    expect(second.body.items[6].startsAt < second.body.items[5].startsAt).toBe(true);
    expect((await get({ ...filters, page: 3 }).expect(200)).body).toMatchObject({ items: [], total: 16, hasMore: false });
  });

  it('keeps explicit locality filters strict and combines priority with sport, format and date', async () => {
    const explicit = await get({ locationId: otherLocationId, preferredLocationId: locationId, sportId }).expect(200);
    expect(explicit.body.total).toBe(1);
    expect(explicit.body.items.every((item: { location: { id: string } }) => item.location.id === otherLocationId)).toBe(true);
    const filters = { locationId: undefined, preferredLocationId: otherLocationId, sportId, sportFormatId: formatId, date: day };
    const first = await get(filters).expect(200);
    const second = await get({ ...filters, page: 2 }).expect(200);
    expect(first.body.total).toBe(12);
    expect(first.body.items[0].location.id).toBe(otherLocationId);
    expect([...first.body.items, ...second.body.items].slice(1).map(item => item.id)).toEqual(dayFormatMatches);
  });

  it('falls back to chronological discovery when the preferred locality has no matches', async () => {
    const filters = { locationId: undefined, sportId };
    const plain = await get(filters).expect(200);
    const preferred = await get({ ...filters, preferredLocationId: randomUUID() }).expect(200);
    expect(preferred.body).toEqual(plain.body);
  });

  it('does not expose matches in inactive localities even when preferred', async () => {
    await db.location.update({ where: { id: otherLocationId }, data: { active: false } });
    try {
      const filters = { locationId: undefined, preferredLocationId: otherLocationId, sportId };
      const first = await get(filters).expect(200);
      const second = await get({ ...filters, page: 2 }).expect(200);
      expect(first.body.total).toBe(15);
      expect([...first.body.items, ...second.body.items].every(item => item.location.id === locationId)).toBe(true);
    } finally {
      await db.location.update({ where: { id: otherLocationId }, data: { active: true } });
    }
  });

  it('filters sport and sport/format while keeping count and hasMore consistent', async () => {
    const sport = await get({ sportId }).expect(200);
    expect(sport.body.total).toBe(15);
    const first = await get({ sportId, sportFormatId: formatId }).expect(200);
    const second = await get({ sportId, sportFormatId: formatId, page: 2 }).expect(200);
    expect(first.body).toMatchObject({ total: 13, pageSize: 9, hasMore: true });
    expect(second.body).toMatchObject({ total: 13, hasMore: false });
    expect([...first.body.items, ...second.body.items].every(item => item.sport.id === sportId && item.sportFormat.id === formatId)).toBe(true);
  });

  it('interprets date as Buenos Aires midnight inclusive through next midnight exclusive', async () => {
    const first = await get({ date: day }).expect(200);
    const second = await get({ date: day, page: 2 }).expect(200);
    expect(first.body.total).toBe(14);
    const ids = [...first.body.items, ...second.body.items].map(item => item.id);
    expect(ids).toEqual([...dayFormatMatches.slice(0, 10), secondFormatMatchId, otherSportMatchId, nullFormatMatchId, dayFormatMatches[10]]);
    expect(ids).not.toContain(otherDayMatchId);
  });

  it('combines location, sport, format and date including filtered pagination', async () => {
    const sportDay = await get({ sportId, date: day }).expect(200);
    expect(sportDay.body.total).toBe(13);
    const filters = { sportId, sportFormatId: formatId, date: day };
    const first = await get(filters).expect(200);
    const second = await get({ ...filters, page: 2 }).expect(200);
    expect(first.body).toMatchObject({ total: 11, hasMore: true, page: 1, pageSize: 9 });
    expect(second.body).toMatchObject({ total: 11, hasMore: false, page: 2 });
    expect([...first.body.items, ...second.body.items].map(item => item.id)).toEqual(dayFormatMatches);
    expect((await get({ ...filters, page: 3 }).expect(200)).body).toMatchObject({ items: [], total: 11, hasMore: false });
  });

  it('excludes already-started matches when filtering the current local day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2099-11-03T10:00:00Z'));
    try {
      const response = await get({ date: day }).expect(200);
      expect(response.body).toMatchObject({ total: 6, hasMore: false });
      expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
        ...dayFormatMatches.slice(8, 10), secondFormatMatchId,
        otherSportMatchId, nullFormatMatchId, dayFormatMatches[10],
      ]);
      expect(response.body.items.every((item: { startsAt: string }) =>
        new Date(item.startsAt).getTime() > Date.now())).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('permits persisted inactive sport and format identities without exposing extra data', async () => {
    const response = await get({ sportId: otherSportId, sportFormatId: otherFormatId, date: day }).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(otherSportMatchId);
    expect(Object.keys(response.body.items[0].sport).sort()).toEqual(['id', 'name', 'slug']);
  });

  it('returns an empty page for valid combinations without matches and past dates', async () => {
    for (const filters of [{ sportId: randomUUID() }, { sportId, date: '2099-11-05' }, { date: '2000-01-01' }, { locationId: otherLocationId, sportId: otherSportId }]) {
      expect((await get(filters).expect(200)).body).toMatchObject({ items: [], total: 0, page: 1, pageSize: 9, hasMore: false });
    }
  });

  it('rejects mismatched formats and formats without sport with stable safe errors', async () => {
    for (const filters of [{ sportFormatId: formatId }, { sportId, sportFormatId: otherFormatId }, { sportId, sportFormatId: randomUUID() }]) {
      const response = await get(filters).expect(400);
      expect(response.body).toMatchObject({ code: 'INVALID_SPORT_FORMAT_FILTER', requestId: expect.any(String), message: expect.any(String) });
    }
  });

  it('validates filter UUIDs, calendar dates and pagination before querying', async () => {
    for (const filters of [
      { locationId: 'bad' }, { preferredLocationId: 'bad' }, { preferredLocationId: '' }, { sportId: 'bad' }, { sportFormatId: 'bad' },
      { date: '2099-02-29' }, { date: '2099-11-31' }, { date: '2099-1-03' },
      { date: '2099-11-03T00:00:00Z' }, { date: '0000-01-01' }, { date: '' },
      { page: 0 }, { page: 1.5 }, { page: 10001 },
    ]) {
      const response = await get(filters).expect(400);
      expect(response.body.requestId).toEqual(expect.any(String));
    }
    await get({ date: '2100-02-29' }).expect(400);
    await get({ date: '2096-02-29' }).expect(200);
  });
});

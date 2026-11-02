import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.module.js';

describe('multisport catalog and match persistence', () => {
  let app: INestApplication;
  let db: PrismaService;
  const sportIds: string[] = [];
  let locationId: string;
  let organizerId: string;
  let activeSport: { id: string; name: string; slug: string };
  let otherSport: { id: string; name: string; slug: string };
  let activeFormat: { id: string; name: string; slug: string };
  let hiddenSportId: string;
  let hiddenFormatId: string;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/hyt_slice_test') {
      throw new Error('Multisport tests require isolated local hyt_slice_test.');
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    const suffix = randomUUID();
    activeSport = await db.sport.create({ data: { name: 'Active test sport', slug: `active-${suffix}` } });
    otherSport = await db.sport.create({ data: { name: 'Other test sport', slug: `other-${suffix}` } });
    const hiddenSport = await db.sport.create({ data: { name: 'Hidden test sport', slug: `hidden-${suffix}`, active: false } });
    hiddenSportId = hiddenSport.id;
    sportIds.push(activeSport.id, otherSport.id, hiddenSport.id);
    activeFormat = await db.sportFormat.create({ data: { sportId: activeSport.id, name: 'Active test format', slug: 'shared-format' } });
    hiddenFormatId = (await db.sportFormat.create({ data: { sportId: activeSport.id, name: 'Hidden test format', slug: 'hidden-format', active: false } })).id;
    await db.sportFormat.create({ data: { sportId: otherSport.id, name: 'Other sport format', slug: 'shared-format' } });
    await db.sportFormat.create({ data: { sportId: hiddenSport.id, name: 'Hidden sport format', slug: 'hidden-sport-format' } });
    locationId = (await db.location.create({ data: { name: `Multisport ${suffix}`, type: 'LOCALIDAD' } })).id;
    organizerId = (await db.user.create({ data: { name: 'Multisport organizer', email: `sports-${suffix}@example.test` } })).id;
  });

  afterAll(async () => {
    if (db) {
      if (locationId) await db.match.deleteMany({ where: { locationId } });
      if (organizerId) await db.user.deleteMany({ where: { id: organizerId } });
      if (locationId) await db.location.deleteMany({ where: { id: locationId } });
      await db.sportFormat.deleteMany({ where: { sportId: { in: sportIds } } });
      await db.sport.deleteMany({ where: { id: { in: sportIds } } });
    }
    await app?.close();
  });

  it('public catalog exposes only active sports and their own active formats with safe fields', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/sports').expect(200);
    const items = response.body.items as { id: string; name: string; slug: string; formats: { id: string; name: string; slug: string }[] }[];
    expect(items.find(item => item.id === hiddenSportId)).toBeUndefined();
    const visible = items.find(item => item.id === activeSport.id)!;
    expect(visible).toEqual({ id: activeSport.id, name: activeSport.name, slug: activeSport.slug, formats: [{ id: activeFormat.id, name: activeFormat.name, slug: activeFormat.slug }] });
    expect(visible.formats.some(format => format.id === hiddenFormatId)).toBe(false);
    const other = items.find(item => item.id === otherSport.id)!;
    expect(other.formats).toHaveLength(1);
    expect(other.formats[0].name).toBe('Other sport format');
    expect(other.formats[0].id).not.toBe(activeFormat.id);
    expect(response.body).not.toHaveProperty('organizer');
  });

  it('match list returns nested sport, optional format and no legacy contract', async () => {
    const base = { organizerId, locationId, sportId: activeSport.id, startsAt: new Date(Date.now() + 86400000), address: 'Test address', pricePerPerson: '1234.50', availablePlaces: 2 };
    const formatted = await db.match.create({ data: { ...base, sportFormatId: activeFormat.id, venueName: 'With format' } });
    const unformatted = await db.match.create({ data: { ...base, sportId: otherSport.id, startsAt: new Date(Date.now() + 172800000), venueName: 'Without format' } });
    const response = await request(app.getHttpServer()).get(`/api/v1/matches?locationId=${locationId}`).expect(200);
    expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 9, hasMore: false });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([formatted.id, unformatted.id]);
    expect(response.body.items[0]).toMatchObject({ sport: { id: activeSport.id, name: activeSport.name, slug: activeSport.slug }, sportFormat: { id: activeFormat.id, name: activeFormat.name, slug: activeFormat.slug }, pricePerPerson: '1234.5' });
    expect(response.body.items[1].sportFormat).toBeNull();
    for (const item of response.body.items) {
      expect(Object.keys(item.sport).sort()).toEqual(['id', 'name', 'slug']);
      expect(item).not.toHaveProperty('footballType');
      expect(item).not.toHaveProperty('organizerId');
    }
    const filtered = await request(app.getHttpServer()).get(`/api/v1/matches?locationId=${locationId}&sportId=${activeSport.id}`).expect(200);
    expect(filtered.body.items.map((item: { id: string }) => item.id)).toEqual([formatted.id]);
  });

  it('database rejects cross-sport formats on create and updates, and permits null format', async () => {
    const data = { organizerId, locationId, sportId: otherSport.id, startsAt: new Date(Date.now() + 86400000), venueName: 'Integrity test', address: 'Test address', pricePerPerson: 0, availablePlaces: 1 };
    await expect(db.match.create({ data: { ...data, sportFormatId: activeFormat.id } })).rejects.toMatchObject({ code: 'P2003' });
    const match = await db.match.create({ data });
    await expect(db.match.update({ where: { id: match.id }, data: { sportFormatId: activeFormat.id } })).rejects.toMatchObject({ code: 'P2003' });
    await db.match.update({ where: { id: match.id }, data: { sportId: activeSport.id, sportFormatId: activeFormat.id } });
    await expect(db.match.update({ where: { id: match.id }, data: { sportId: otherSport.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.sportFormat.update({ where: { id: activeFormat.id }, data: { sportId: otherSport.id, slug: 'moved-format' } })).rejects.toMatchObject({ code: 'P2003' });
    const changed = await db.match.update({ where: { id: match.id }, data: { sportId: otherSport.id, sportFormatId: null } });
    expect(changed.sportFormatId).toBeNull();
  });

  it('enforces catalog slugs while allowing equal format slugs in different sports', async () => {
    await expect(db.sport.create({ data: { name: 'Duplicate sport', slug: activeSport.slug } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.sportFormat.create({ data: { name: 'Duplicate format', sportId: activeSport.id, slug: activeFormat.slug } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.sportFormat.count({ where: { sportId: { in: sportIds }, slug: 'shared-format' } })).toBe(2);
  });
});

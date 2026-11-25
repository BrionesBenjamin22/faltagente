import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, api, prismaFixture, hashFixturePassword } from './support/harness';

const password = 'Waitlist browser test 123!';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
}

async function post(context: BrowserContext, path: string, data = {}) {
  const csrf = await (await context.request.get(`${api}/auth/csrf`)).json();
  return context.request.post(`${api}${path}`, {
    headers: { Origin: new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3000').origin, 'X-CSRF-Token': csrf.csrfToken }, data,
  });
}

async function fixture() {
  const db = prismaFixture();
  const suffix = randomUUID();
  const location = await db.location.findUniqueOrThrow({ where: { seedKey: 'la-plata-tolosa' } });
  const sport = await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } });
  const passwordHash = await hashFixturePassword(password);
  const users: { id: string; email: string; name: string }[] = [];
  async function user(name: string) {
    const row = await db.user.create({ data: { name, email: `waitlist-${users.length}-${suffix}@example.test`, passwordHash, primaryLocationId: location.id } });
    users.push(row);
    return row;
  }
  const organizer = await user('Organizador de espera');
  const holder = await user('Titular original');
  const waiter = await user('Jugador en espera');
  const day = new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10);
  const localDate = new Date(`${day}T00:00:00Z`);
  const match = await db.match.create({ data: {
    organizerId: organizer.id, locationId: location.id, sportId: sport.id,
    startsAt: new Date(`${day}T19:00:00-03:00`), venueName: `Espera ${suffix.slice(0, 8)}`,
    address: 'Calle 1 y 60', pricePerPerson: 4000, totalPlaces: 2, availablePlaces: 0, status: 'CLOSED',
    participations: { create: [{ userId: organizer.id, role: 'ORGANIZER', localDate }, { userId: holder.id, role: 'PLAYER', localDate }] },
    reservations: { create: { userId: holder.id, places: 2 } },
  }, include: { reservations: true } });
  return { db, organizer, holder, waiter, match, cleanup: async () => {
    await db.waitlistEvent.deleteMany({ where: { matchId: match.id } });
    await db.waitlistOffer.deleteMany({ where: { entry: { matchId: match.id } } });
    await db.waitlistEntry.deleteMany({ where: { matchId: match.id } });
    await db.reservation.deleteMany({ where: { matchId: match.id } });
    await db.participation.deleteMany({ where: { matchId: match.id } });
    await db.match.delete({ where: { id: match.id } });
    await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    await db.$disconnect();
  } };
}

test('waitlist holds released places until the player accepts and appears in reserved matches', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const data = await fixture();
  const ownerContext = await browser.newContext();
  const holderContext = await browser.newContext();
  try {
    await login(page, data.waiter.email);
    await page.goto(`/partidos/${data.match.id}`);
    await page.getByLabel('Cantidad de lugares en espera', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Entrar en lista de espera', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salir de la lista', exact: true })).toBeVisible();
    expect(await data.db.participation.count({ where: { matchId: data.match.id, userId: data.waiter.id, active: true } })).toBe(0);
    await page.goto('/mis-partidos');
    await page.getByRole('button', { name: 'En espera', exact: true }).click();
    await expect(page.getByText(data.match.venueName, { exact: true })).toBeVisible();

    const ownerPage = await ownerContext.newPage();
    await login(ownerPage, data.organizer.email);
    await ownerPage.goto(`/partidos/${data.match.id}`);
    const list = ownerPage.getByRole('region', { name: 'Lista de espera del partido', exact: true });
    await expect(list).toContainText(data.waiter.name);
    await expect(list).not.toContainText(data.waiter.email);

    const holderPage = await holderContext.newPage();
    await login(holderPage, data.holder.email);
    expect((await post(holderContext, `/matches/${data.match.id}/reservations/${data.match.reservations[0].id}/cancel`)).ok()).toBe(true);
    await page.goto(`/partidos/${data.match.id}`);
    await expect(page.getByRole('heading', { name: 'Tenés una oferta', exact: true })).toBeVisible();
    expect((await data.db.match.findUniqueOrThrow({ where: { id: data.match.id } })).availablePlaces).toBe(0);
    expect(await data.db.reservation.count({ where: { matchId: data.match.id, status: 'CONFIRMED' } })).toBe(0);
    // The held places cannot be taken through the ordinary reservation endpoint.
    expect((await post(holderContext, `/matches/${data.match.id}/reservations`, { places: 1 })).status()).toBe(409);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Aceptar oferta', exact: true }).click();
    await expect(page.getByText('Inscripción confirmada', { exact: true })).toBeVisible();
    expect(await data.db.reservation.count({ where: { matchId: data.match.id, userId: data.waiter.id, status: 'CONFIRMED', places: 2 } })).toBe(1);
    expect(await data.db.participation.count({ where: { matchId: data.match.id, userId: data.waiter.id, role: 'PLAYER', active: true } })).toBe(1);
    await page.goto('/mis-partidos');
    await page.getByRole('button', { name: 'Reservados', exact: true }).click();
    await expect(page.getByText(data.match.venueName, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'En espera', exact: true }).click();
    await expect(page.getByText(data.match.venueName, { exact: true })).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await holderContext.close();
    await data.cleanup();
  }
});

test('leaving is confirmed, a new request gets new seniority, and rejection releases its hold', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const data = await fixture();
  const holderContext = await browser.newContext();
  try {
    await login(page, data.waiter.email);
    await page.goto(`/partidos/${data.match.id}`);
    await page.getByRole('button', { name: 'Entrar en lista de espera', exact: true }).click();
    await page.getByRole('button', { name: 'Salir de la lista', exact: true }).click();
    await page.getByRole('button', { name: 'Seguir en espera', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salir de la lista', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Salir de la lista', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar salida', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Entrar en lista de espera', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Entrar en lista de espera', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salir de la lista', exact: true })).toBeVisible();
    const entries = await data.db.waitlistEntry.findMany({ where: { matchId: data.match.id, userId: data.waiter.id }, orderBy: { createdAt: 'asc' } });
    expect(entries).toHaveLength(2);
    expect(entries[0].status).toBe('LEFT');
    expect(entries[1].createdAt.getTime()).toBeGreaterThan(entries[0].createdAt.getTime());

    const holderPage = await holderContext.newPage();
    await login(holderPage, data.holder.email);
    expect((await post(holderContext, `/matches/${data.match.id}/reservations/${data.match.reservations[0].id}/cancel`)).ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tenés una oferta', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rechazar oferta', exact: true }).click();
    await page.getByRole('button', { name: 'Mantener oferta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aceptar oferta', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rechazar oferta', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar rechazo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aceptar oferta', exact: true })).toHaveCount(0);
    expect(await data.db.reservation.count({ where: { matchId: data.match.id, status: 'CONFIRMED' } })).toBe(0);
    expect((await data.db.match.findUniqueOrThrow({ where: { id: data.match.id } })).availablePlaces).toBe(2);
    expect(await data.db.waitlistEntry.count({ where: { matchId: data.match.id, status: { in: ['WAITING', 'OFFERED'] } } })).toBe(0);
  } finally {
    await holderContext.close();
    await data.cleanup();
  }
});

test('an expired offer cannot be accepted and the background worker reassigns its places', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const data = await fixture();
  const holderContext = await browser.newContext();
  try {
    await login(page, data.waiter.email);
    await page.goto(`/partidos/${data.match.id}`);
    await page.getByLabel('Cantidad de lugares en espera', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Entrar en lista de espera', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salir de la lista', exact: true })).toBeVisible();
    const holderPage = await holderContext.newPage();
    await login(holderPage, data.holder.email);
    expect((await post(holderContext, `/matches/${data.match.id}/reservations/${data.match.reservations[0].id}/cancel`)).ok()).toBe(true);
    // A second eligible request waits behind the existing protected offer.
    expect((await post(holderContext, `/matches/${data.match.id}/waitlist`, { places: 2 })).ok()).toBe(true);
    const offer = await data.db.waitlistOffer.findFirstOrThrow({ where: { entry: { matchId: data.match.id, userId: data.waiter.id }, status: 'PENDING' } });
    await data.db.waitlistOffer.update({ where: { id: offer.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await page.reload();
    await expect(page.getByText(/Tu solicitud terminó porque la oferta venció/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aceptar oferta', exact: true })).toHaveCount(0);
    expect(await data.db.reservation.count({ where: { matchId: data.match.id, userId: data.waiter.id, status: 'CONFIRMED' } })).toBe(0);
    // The real Nest lifecycle worker must eventually free and reassign the hold.
    await expect.poll(() => data.db.waitlistOffer.count({ where: { entry: { matchId: data.match.id, userId: data.holder.id }, status: 'PENDING' } }), { timeout: 40_000, intervals: [500, 1000, 2000] }).toBe(1);
    const expiredAccept = await post(page.context(), `/waitlist/offers/${offer.id}/accept`);
    expect(expiredAccept.status()).toBe(409);
    expect((await data.db.waitlistOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe('EXPIRED');
    expect((await data.db.match.findUniqueOrThrow({ where: { id: data.match.id } })).availablePlaces).toBe(0);
    expect(await data.db.reservation.count({ where: { matchId: data.match.id, status: 'CONFIRMED' } })).toBe(0);
  } finally {
    await holderContext.close();
    await data.cleanup();
  }
});

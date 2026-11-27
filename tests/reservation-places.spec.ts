import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, api, prismaFixture, hashFixturePassword } from './support/harness';

const password = 'Reservation places test 123!';
async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
}
async function mutation(context: BrowserContext, path: string, data = {}, method = 'POST') {
  const csrf = await (await context.request.get(`${api}/auth/csrf`)).json();
  return context.request.fetch(`${api}${path}`, {
    method, headers: { Origin: new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3000').origin, 'X-CSRF-Token': csrf.csrfToken }, data,
  });
}
async function fixture(places = 3) {
  const db = prismaFixture();
  const suffix = randomUUID();
  const location = await db.location.findUniqueOrThrow({ where: { seedKey: 'la-plata-tolosa' } });
  const sport = await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } });
  const passwordHash = await hashFixturePassword(password);
  const users: { id: string; email: string; name: string }[] = [];
  async function user(name: string) {
    const row = await db.user.create({ data: { name, email: `places-${users.length}-${suffix}@example.test`, passwordHash, primaryLocationId: location.id } });
    users.push(row); return row;
  }
  const organizer = await user('Organizador de reservas');
  const holder = await user('Titular de reserva');
  const waiter = await user('Jugador en espera');
  const day = new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10);
  const match = await db.match.create({ data: {
    organizerId: organizer.id, locationId: location.id, sportId: sport.id,
    startsAt: new Date(`${day}T19:00:00-03:00`), venueName: `Lugares ${suffix.slice(0, 8)}`,
    address: 'Calle 1 y 60', pricePerPerson: 4000, totalPlaces: places, availablePlaces: places,
    participations: { create: { userId: organizer.id, role: 'ORGANIZER', localDate: new Date(`${day}T00:00:00Z`) } },
  } });
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

test('holder reduces quantities without names or reasons, preserves drafts and paginated movements', async ({ page, context }) => {
  test.setTimeout(120_000);
  const data = await fixture(6);
  try {
    await login(page, data.holder.email);
    await page.goto(`/partidos/${data.match.id}`);
    await page.getByLabel('Cantidad de lugares', { exact: true }).fill('6');
    await expect(page.getByLabel(/Acompañante/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
    await expect(page.getByText('Inscripción confirmada', { exact: true })).toBeVisible();
    const own = await (await context.request.get(`${api}/matches/${data.match.id}/reservations/me`)).json();
    expect(own).toMatchObject({ places: 6, originalPlaces: 6 });
    expect(own).not.toHaveProperty('companions');
    let updates = 0;
    page.on('request', req => { if (req.method() === 'PATCH' && req.url().endsWith(`/reservations/${own.id}/places`)) updates++; });
    await page.getByRole('button', { name: 'Reducir lugares', exact: true }).click();
    await page.getByRole('button', { name: 'Revisar reducción', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reducir lugares', exact: true })).toBeEnabled();
    expect(updates).toBe(0);
    await page.getByRole('button', { name: 'Reducir lugares', exact: true }).click();
    const places = page.getByLabel('Lugares a conservar', { exact: true });
    await places.fill('5');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    // A second tab changes the version while the first keeps a draft.
    expect((await mutation(context, `/matches/${data.match.id}/reservations/${own.id}/places`, { expectedVersion: own.version, places: 4 }, 'PATCH')).status()).toBe(200);
    await page.getByRole('button', { name: 'Revisar reducción', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar reducción', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Recargar reserva', exact: true })).toBeVisible();
    await expect(places).toHaveValue('5');
    await page.getByRole('button', { name: 'Recargar reserva', exact: true }).click();
    await expect(page.getByText('4 lugares reservados.', { exact: true })).toBeVisible();
    for (const remaining of [3, 2, 1]) {
      await page.getByRole('button', { name: 'Reducir lugares', exact: true }).click();
      await page.getByLabel('Lugares a conservar', { exact: true }).fill(String(remaining));
      await page.getByRole('button', { name: 'Revisar reducción', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar reducción', exact: true }).click();
      await expect(page.getByText(`${remaining} ${remaining === 1 ? 'lugar reservado' : 'lugares reservados'}.`, { exact: true })).toBeVisible();
    }
    expect(await data.db.participation.findUniqueOrThrow({ where: { userId_matchId: { userId: data.holder.id, matchId: data.match.id } } })).toMatchObject({ active: true });
    await expect(page.getByRole('button', { name: 'Reducir lugares', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver bajas', exact: true }).click();
    const movements = page.getByRole('region', { name: 'Bajas de la reserva', exact: true });
    await expect(movements.getByText('Reducción de lugares', { exact: true })).toHaveCount(3);
    await movements.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(movements.getByText('Reducción de lugares', { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await data.cleanup(); }
});

test('partial release reassigns a compatible waitlist offer atomically', async ({ page, browser, context }) => {
  test.setTimeout(120_000);
  const data = await fixture();
  const waiterContext = await browser.newContext();
  try {
    await login(page, data.holder.email);
    expect((await mutation(context, `/matches/${data.match.id}/reservations`, { places: 3 })).status()).toBe(201);
    const waiterPage = await waiterContext.newPage();
    await login(waiterPage, data.waiter.email);
    await waiterPage.goto(`/partidos/${data.match.id}`);
    await waiterPage.getByLabel('Cantidad de lugares en espera', { exact: true }).fill('2');
    await waiterPage.getByRole('button', { name: 'Entrar en lista de espera', exact: true }).click();
    await expect(waiterPage.getByRole('button', { name: 'Salir de la lista', exact: true })).toBeVisible();
    await page.goto(`/partidos/${data.match.id}`);
    await page.getByRole('button', { name: 'Reducir lugares', exact: true }).click();
    await page.getByLabel('Lugares a conservar', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Revisar reducción', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar reducción', exact: true }).click();
    await expect(page.getByText('1 lugar reservado.', { exact: true })).toBeVisible();
    await waiterPage.reload();
    await expect(waiterPage.getByRole('heading', { name: 'Tenés una oferta', exact: true })).toBeVisible();
    expect((await data.db.match.findUniqueOrThrow({ where: { id: data.match.id } })).availablePlaces).toBe(0);
    await waiterPage.getByRole('button', { name: 'Aceptar oferta', exact: true }).click();
    await expect(waiterPage.getByText('Inscripción confirmada', { exact: true })).toBeVisible();
    const own = await (await waiterContext.request.get(`${api}/matches/${data.match.id}/reservations/me`)).json();
    expect(own).toMatchObject({ places: 2, originalPlaces: 2, version: 1 });
    expect(own).not.toHaveProperty('companions');
  } finally { await waiterContext.close(); await data.cleanup(); }
});

for (const reason of [undefined, 'Cambio de organización']) {
  test(`organizer reduces and cancels a reservation ${reason ? 'with an optional reason' : 'without a reason'}`, async ({ page, browser, context }) => {
    test.setTimeout(120_000);
    const data = await fixture();
    const organizerContext = await browser.newContext();
    try {
      await login(page, data.holder.email);
      expect((await mutation(context, `/matches/${data.match.id}/reservations`, { places: 3 })).status()).toBe(201);
      const own = await (await context.request.get(`${api}/matches/${data.match.id}/reservations/me`)).json();
      expect((await mutation(context, `/matches/${data.match.id}/reservations/${own.id}/cancel-by-organizer`, { expectedVersion: own.version })).status()).toBe(404);
      const organizerPage = await organizerContext.newPage();
      await login(organizerPage, data.organizer.email);
      await organizerPage.goto(`/partidos/${data.match.id}`);
      const list = organizerPage.getByRole('region', { name: 'Reservas confirmadas', exact: true });
      await list.getByRole('button', { name: `Reducir lugares de ${data.holder.name}`, exact: true }).click();
      await organizerPage.getByLabel('Lugares a conservar', { exact: true }).fill('2');
      if (reason) await organizerPage.getByLabel('Motivo de la reducción (opcional)', { exact: true }).fill(reason);
      await organizerPage.getByRole('button', { name: 'Revisar reducción', exact: true }).click();
      await organizerPage.getByRole('button', { name: 'Confirmar reducción', exact: true }).click();
      await expect(list).toContainText('2 lugares reservados');
      await list.getByRole('button', { name: `Cancelar reserva de ${data.holder.name}`, exact: true }).click();
      const confirmation = organizerPage.getByRole('region', { name: `Cancelar reserva de ${data.holder.name}`, exact: true });
      await expect(confirmation).toContainText('2 lugares');
      if (reason) await confirmation.getByLabel('Motivo de cancelación (opcional)', { exact: true }).fill(reason);
      await confirmation.getByRole('button', { name: 'Confirmar cancelación de reserva', exact: true }).click();
      await expect(organizerPage.getByText('3 lugares disponibles', { exact: true })).toBeVisible();
      expect(await data.db.reservation.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({ status: 'CANCELLED', cancellationSource: 'ORGANIZER', cancellationReason: reason ?? null, places: 2 });
      await page.goto(`/partidos/${data.match.id}`);
      const history = page.getByRole('region', { name: 'Historial de reservas', exact: true });
      await expect(history).toContainText('Cancelada por el organizador');
      await history.getByRole('button', { name: 'Ver bajas', exact: true }).click();
      const movements = page.getByRole('region', { name: 'Bajas de la reserva', exact: true });
      await expect(movements).toContainText('Reducción de lugares');
      if (reason) await expect(movements).toContainText(reason);
      expect((await organizerContext.request.get(`${api}/matches/${data.match.id}/reservations/${own.id}/cancellations`)).status()).toBe(404);
    } finally { await organizerContext.close(); await data.cleanup(); }
  });
}

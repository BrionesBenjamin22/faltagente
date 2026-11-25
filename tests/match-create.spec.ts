import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, api, prismaFixture, hashFixturePassword } from './support/harness';
import { expectNoAuditSections, trackChangeHistoryRequests } from './support/audit';

const password = 'Match browser test 123!';
const futureDay = (offset = 14) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function organizerFixture() {
  const db = prismaFixture();
  const location = await db.location.findUniqueOrThrow({ where: { seedKey: 'la-plata-tolosa' } });
  const organizer = await db.user.create({ data: {
    name: 'Organizador de prueba', email: `publish-${randomUUID()}@example.test`,
    passwordHash: await hashFixturePassword(password), primaryLocationId: location.id,
  } });
  return { db, organizer, cleanup: async () => {
    const matches = await db.match.findMany({ where: { organizerId: organizer.id }, select: { id: true } });
    await db.participation.deleteMany({ where: { matchId: { in: matches.map((match: { id: string }) => match.id) } } });
    await db.match.deleteMany({ where: { organizerId: organizer.id } });
    await db.user.delete({ where: { id: organizer.id } });
    await db.$disconnect();
  } };
}

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Partidos disponibles', exact: true })).toBeVisible();
}

async function fillMatch(page: Page, placeName: string) {
  await page.getByLabel('Deporte', { exact: true }).selectOption({ label: 'Fútbol' });
  await page.getByLabel('Formato (opcional)', { exact: true }).selectOption({ label: 'Fútbol 5' });
  await page.getByLabel('Fecha', { exact: true }).fill(futureDay());
  await page.getByLabel('Hora', { exact: true }).fill('23:30');
  await page.getByLabel('Nombre del lugar', { exact: true }).fill(placeName);
  await page.getByLabel('Dirección', { exact: true }).fill('Calle 7 número 123');
  await page.getByLabel('Precio por persona (ARS)', { exact: true }).fill('4200.50');
  await page.getByLabel('Lugares para jugadores', { exact: true }).fill('4');
  await page.getByLabel('Descripción (opcional)', { exact: true }).fill('Traer agua y llegar diez minutos antes.');
}

test('publishes as an unverified organizer and retains publication records without exposing audit to organizer or visitor', async ({ page, context }) => {
  const historyRequests = trackChangeHistoryRequests(page);
  const fixture = await organizerFixture();
  const placeName = `Cancha ${randomUUID().slice(0, 8)}`;
  try {
    await login(page, fixture.organizer.email);
    await page.getByRole('link', { name: 'Publicar partido', exact: true }).click();
    await expect(page).toHaveURL(/\/partidos\/nuevo$/);
    await fillMatch(page, placeName);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.runtime/mvp04-create-mobile.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByLabel('Nombre del lugar', { exact: true })).toHaveValue(placeName);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const created = page.waitForResponse(response => response.url() === `${api}/matches` && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Publicar partido', exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    await expect(page).toHaveURL(url => url.pathname === '/' && url.searchParams.get('success') === 'match-created');
    await expect(page.getByText('Partido publicado correctamente.', { exact: true })).toBeVisible();
    const match = await fixture.db.match.findUniqueOrThrow({ where: { id }, include: { participations: true, changes: true } });
    expect(match.organizerId).toBe(fixture.organizer.id);
    expect(match.totalPlaces).toBe(4);
    expect(match.availablePlaces).toBe(4);
    expect(match.version).toBe(1);
    expect(match.startsAt.toISOString()).toBe(new Date(`${futureDay()}T23:30:00-03:00`).toISOString());
    expect(match.participations).toHaveLength(1);
    expect(match.participations[0]).toMatchObject({ userId: fixture.organizer.id, role: 'ORGANIZER', active: true });
    expect(match.participations[0].localDate.toISOString().slice(0, 10)).toBe(futureDay());
    expect(match.changes).toHaveLength(1);
    expect(match.changes[0].event).toBe('PUBLISHED');
    await page.getByRole('link', { name: 'Mis partidos', exact: true }).click();
    await expect(page).toHaveURL(/\/mis-partidos/);
    await expect(page.getByText(placeName, { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.runtime/mvp04-my-matches-mobile.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('link', { name: `Ver partido en ${placeName}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/partidos/${id}$`));
    // A fresh visit must also work without relying on list or router state.
    await page.goto(`/partidos/${id}`);
    await expect(page.getByText(placeName, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar', exact: true })).toBeVisible();
    await expectNoAuditSections(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.clearCookies();
    await page.reload();
    await expect(page.getByText(placeName, { exact: true })).toBeVisible();
    await expectNoAuditSections(page);
    expect(historyRequests).toEqual([]);
  } finally { await fixture.cleanup(); }
});

test('a failed publication preserves the form and can be retried without creating duplicate records', async ({ page }) => {
  const fixture = await organizerFixture();
  const placeName = `Reintento ${randomUUID().slice(0, 8)}`;
  let failNext = true;
  try {
    await login(page, fixture.organizer.email);
    await page.goto('/partidos/nuevo');
    await fillMatch(page, placeName);
    await page.route('**/api/v1/matches', async route => {
      if (route.request().method() === 'POST' && failNext) { failNext = false; await route.abort('failed'); }
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Publicar partido', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(/intente nuevamente/i);
    await expect(page.getByLabel('Nombre del lugar', { exact: true })).toHaveValue(placeName);
    expect(await fixture.db.match.count({ where: { organizerId: fixture.organizer.id } })).toBe(0);
    await page.getByRole('button', { name: 'Publicar partido', exact: true }).click();
    await expect(page.getByText('Partido publicado correctamente.', { exact: true })).toBeVisible();
    expect(await fixture.db.match.count({ where: { organizerId: fixture.organizer.id } })).toBe(1);
  } finally { await fixture.cleanup(); }
});

test('direct creation requires a session and revocation prevents publishing from an open form', async ({ page }) => {
  await page.goto('/partidos/nuevo');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('button', { name: 'Publicar partido', exact: true })).toHaveCount(0);
  await page.goto('/mis-partidos');
  await expect(page).toHaveURL(/\/auth\/login/);
  const fixture = await organizerFixture();
  try {
    await login(page, fixture.organizer.email);
    await page.goto('/partidos/nuevo');
    await fillMatch(page, 'No se debe publicar');
    await fixture.db.session.updateMany({ where: { userId: fixture.organizer.id }, data: { revokedAt: new Date() } });
    await page.getByRole('button', { name: 'Publicar partido', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(await fixture.db.match.count({ where: { organizerId: fixture.organizer.id } })).toBe(0);
  } finally { await fixture.cleanup(); }
});

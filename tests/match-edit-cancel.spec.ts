import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, api, prismaFixture, hashFixturePassword } from './support/harness';

const password = 'Match browser test 123!';
async function fixture() {
  const db = prismaFixture();
  const location = await db.location.findUniqueOrThrow({ where: { seedKey: 'la-plata-tolosa' } });
  const sport = await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } });
  const organizer = await db.user.create({ data: { name: 'Organizador edición', email: `edit-${randomUUID()}@example.test`, passwordHash: await hashFixturePassword(password), primaryLocationId: location.id } });
  const day = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const match = await db.match.create({ data: { organizerId: organizer.id, locationId: location.id, sportId: sport.id, startsAt: new Date(`${day}T19:30:00-03:00`), venueName: `Cancha ${randomUUID().slice(0, 8)}`, address: 'Calle 1 y 60', pricePerPerson: 5000, totalPlaces: 4, availablePlaces: 4, description: 'Descripción original', participations: { create: { userId: organizer.id, role: 'ORGANIZER', localDate: new Date(`${day}T00:00:00Z`) } }, changes: { create: { actorId: organizer.id, event: 'PUBLISHED', changes: {} } } } });
  return { db, organizer, match, cleanup: async () => {
    await db.participation.deleteMany({ where: { matchId: match.id } });
    await db.match.delete({ where: { id: match.id } });
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

test('edits only differences, consumes success once and confirms or dismisses cancellation on mobile and desktop', async ({ page }) => {
  const data = await fixture();
  const patches: Record<string, unknown>[] = [];
  page.on('request', request => { if (request.url() === `${api}/matches/${data.match.id}` && request.method() === 'PATCH') patches.push(request.postDataJSON()); });
  try {
    await login(page, data.organizer.email);
    await page.goto(`/partidos/${data.match.id}/editar`);
    await expect(page.getByRole('heading', { name: 'Editar partido' })).toBeVisible();
    await expect(page.getByLabel('Deporte', { exact: true })).toHaveValue(data.match.sportId);
    await expect(page.getByLabel('Localidad', { exact: true })).toHaveValue(data.match.locationId);
    await expect(page.getByLabel('Formato (opcional)', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('No hay cambios para guardar', { exact: true })).toBeVisible();
    expect(patches).toHaveLength(0);
    await page.getByLabel('Descripción (opcional)', { exact: true }).fill('Descripción actualizada');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.runtime/mvp05-edit-mobile.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.runtime/mvp05-edit-desktop.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(new RegExp(`/partidos/${data.match.id}$`));
    await expect(page.getByText('Partido actualizado correctamente', { exact: true })).toBeVisible();
    expect(patches).toEqual([{ expectedVersion: 1, description: 'Descripción actualizada' }]);
    await page.reload();
    await expect(page.getByText('Partido actualizado correctamente', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancelar partido', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Cancelar partido', exact: true });
    await expect(panel.getByRole('heading')).toBeFocused();
    await panel.getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancelar partido', exact: true })).toBeFocused();
    expect((await data.db.match.findUniqueOrThrow({ where: { id: data.match.id } })).status).toBe('OPEN');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Cancelar partido', exact: true }).click();
    await panel.getByLabel('Motivo (opcional)', { exact: true }).fill('  Lluvia  ');
    await page.screenshot({ path: '.runtime/mvp05-cancel-mobile.png', fullPage: true, animations: 'disabled' });
    await panel.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    await expect(page.getByText('Partido cancelado correctamente', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0);
    const saved = await data.db.match.findUniqueOrThrow({ where: { id: data.match.id }, include: { participations: true, changes: true } });
    expect(saved).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Lluvia', version: 3, availablePlaces: 4, totalPlaces: 4 });
    expect(saved.participations[0].active).toBe(false);
    expect(saved.changes.map((change: { event: string }) => change.event).sort()).toEqual(['CANCELLED', 'PUBLISHED', 'UPDATED']);
    await page.getByRole('link', { name: 'Mis partidos', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelados', exact: true }).click();
    await expect(page.getByText(data.match.venueName, { exact: true })).toBeVisible();
  } finally { await data.cleanup(); }
});

test('preserves edits after a concurrent version conflict and a recoverable network error', async ({ page }) => {
  const data = await fixture();
  try {
    await login(page, data.organizer.email);
    await page.goto(`/partidos/${data.match.id}/editar`);
    await page.getByLabel('Descripción (opcional)', { exact: true }).fill('Mi cambio sin guardar');
    await data.db.match.update({ where: { id: data.match.id }, data: { version: { increment: 1 }, description: 'Cambio concurrente' } });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('button', { name: 'Recargar versión actual' })).toBeVisible();
    await expect(page.getByLabel('Descripción (opcional)', { exact: true })).toHaveValue('Mi cambio sin guardar');
    expect(await data.db.matchChange.count({ where: { matchId: data.match.id, event: 'UPDATED' } })).toBe(0);
    await page.getByRole('button', { name: 'Recargar versión actual' }).click();
    await expect(page.getByLabel('Descripción (opcional)', { exact: true })).toHaveValue('Cambio concurrente');
    let fail = true;
    await page.route(`${api}/matches/${data.match.id}`, async route => {
      if (route.request().method() === 'PATCH' && fail) { fail = false; await route.abort('failed'); } else await route.continue();
    });
    await page.getByLabel('Descripción (opcional)', { exact: true }).fill('Cambio recuperado');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(/Intente nuevamente/i);
    await expect(page.getByLabel('Descripción (opcional)', { exact: true })).toHaveValue('Cambio recuperado');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Partido actualizado correctamente', { exact: true })).toBeVisible();
    expect((await data.db.match.findUniqueOrThrow({ where: { id: data.match.id } })).version).toBe(3);
  } finally { await data.cleanup(); }
});

test('direct editing requires a current session and cannot save after revocation', async ({ page }) => {
  const data = await fixture();
  try {
    await page.goto(`/partidos/${data.match.id}/editar`);
    await expect(page).toHaveURL(/\/auth\/login/);
    await login(page, data.organizer.email);
    await page.goto(`/partidos/${data.match.id}/editar`);
    await page.getByLabel('Descripción (opcional)', { exact: true }).fill('No guardar');
    await data.db.session.updateMany({ where: { userId: data.organizer.id }, data: { revokedAt: new Date() } });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    expect((await data.db.match.findUniqueOrThrow({ where: { id: data.match.id } })).version).toBe(1);
  } finally { await data.cleanup(); }
});

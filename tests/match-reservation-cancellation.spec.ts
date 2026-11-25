import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, api, prismaFixture, hashFixturePassword } from './support/harness';

const password = 'Match cancellation browser 123!';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
}

async function fixture() {
  const db = prismaFixture();
  const suffix = randomUUID();
  const location = await db.location.findUniqueOrThrow({ where: { seedKey: 'la-plata-tolosa' } });
  const sport = await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } });
  const passwordHash = await hashFixturePassword(password);
  const users: { id: string; email: string }[] = [];
  const matches: string[] = [];
  async function user(name: string) {
    const row = await db.user.create({ data: { name, email: `match-cancel-${users.length}-${suffix}@example.test`, passwordHash, primaryLocationId: location.id } });
    users.push(row);
    return row;
  }
  const organizer = await user('Organizador de cancelación');
  const player = await user('Titular afectado');
  const former = await user('Titular que se retiró');
  async function match(offset: number, availablePlaces = 4) {
    const day = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const row = await db.match.create({ data: {
      organizerId: organizer.id, locationId: location.id, sportId: sport.id,
      startsAt: new Date(`${day}T19:00:00-03:00`), venueName: `Cancelación ${suffix.slice(0, 8)} ${offset}`,
      address: 'Calle 1 y 60', pricePerPerson: 4000, totalPlaces: 4, availablePlaces,
      status: availablePlaces === 0 ? 'CLOSED' : 'OPEN',
      participations: { create: { userId: organizer.id, role: 'ORGANIZER', localDate: new Date(`${day}T00:00:00Z`) } },
      changes: { create: { actorId: organizer.id, event: 'PUBLISHED', changes: {} } },
    } });
    matches.push(row.id);
    return { ...row, localDate: new Date(`${day}T00:00:00Z`) };
  }
  async function reservation(holderId: string, matchId: string, localDate: Date, places: number, cancelled = false) {
    await db.participation.upsert({ where: { userId_matchId: { userId: holderId, matchId } },
      create: { userId: holderId, matchId, role: 'PLAYER', localDate, active: !cancelled }, update: { active: !cancelled } });
    return db.reservation.create({ data: { userId: holderId, matchId, places,
      ...(cancelled ? { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Motivo privado del titular', cancellationSource: 'USER' } : {}),
    } });
  }
  return { db, organizer, player, former, user, match, reservation, cleanup: async () => {
    await db.reservation.deleteMany({ where: { matchId: { in: matches } } });
    await db.participation.deleteMany({ where: { matchId: { in: matches } } });
    await db.match.deleteMany({ where: { id: { in: matches } } });
    await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    await db.$disconnect();
  } };
}

test('organizer cancels all active reservations and only affected holders see the private reason', async ({ page, browser, context }) => {
  test.setTimeout(120_000);
  const data = await fixture();
  const playerContext = await browser.newContext();
  const formerContext = await browser.newContext();
  try {
    const second = await data.user('Segundo titular');
    const match = await data.match(20, 1);
    await data.reservation(data.player.id, match.id, match.localDate, 2);
    await data.reservation(second.id, match.id, match.localDate, 1);
    const voluntary = await data.reservation(data.former.id, match.id, match.localDate, 1, true);
    await login(page, data.organizer.email);
    await page.goto(`/partidos/${match.id}`);
    await page.getByRole('button', { name: 'Cancelar partido', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Cancelar partido', exact: true });
    await expect(panel).toContainText('Se cancelarán 2 reservas confirmadas que ocupan 3 lugares.');
    await panel.getByRole('button', { name: 'Volver', exact: true }).click();
    expect(await data.db.reservation.count({ where: { matchId: match.id, status: 'CONFIRMED' } })).toBe(2);
    await page.getByRole('button', { name: 'Cancelar partido', exact: true }).click();
    const reason = panel.getByLabel('Motivo (opcional)', { exact: true });
    await reason.fill('  La cancha cerró por reparaciones  ');
    // A stale organizer must explicitly reload rather than overwrite a newer version.
    await data.db.match.update({ where: { id: match.id }, data: { version: { increment: 1 }, description: 'Cambio concurrente' } });
    await panel.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Recargar versión actual', exact: true })).toBeVisible();
    await expect(reason).toHaveValue('  La cancha cerró por reparaciones  ');
    expect(await data.db.reservation.count({ where: { matchId: match.id, status: 'CONFIRMED' } })).toBe(2);
    await panel.getByRole('button', { name: 'Recargar versión actual', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Confirmar cancelación', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    await expect(page.getByText('Partido cancelado correctamente', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar partido', exact: true })).toHaveCount(0);
    expect(await data.db.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'CANCELLED', totalPlaces: 4, availablePlaces: 4, version: 3, cancellationReason: 'La cancha cerró por reparaciones' });
    expect(await data.db.reservation.count({ where: { matchId: match.id, status: 'CANCELLED', cancellationSource: 'MATCH' } })).toBe(2);
    expect(await data.db.participation.count({ where: { matchId: match.id, active: true } })).toBe(0);
    expect(await data.db.reservation.findUniqueOrThrow({ where: { id: voluntary.id } })).toMatchObject({ cancellationSource: 'USER', cancellationReason: 'Motivo privado del titular' });
    const csrf = await (await context.request.get(`${api}/auth/csrf`)).json();
    const repeated = await context.request.post(`${api}/matches/${match.id}/cancel`, { headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': csrf.csrfToken }, data: { expectedVersion: 1, reason: 'No reemplazar' } });
    expect(repeated.status()).toBe(201);
    expect(await data.db.matchChange.count({ where: { matchId: match.id, event: 'CANCELLED' } })).toBe(1);
    expect((await data.db.match.findUniqueOrThrow({ where: { id: match.id } })).cancellationReason).toBe('La cancha cerró por reparaciones');

    const playerPage = await playerContext.newPage();
    await login(playerPage, data.player.email);
    await playerPage.goto(`/partidos/${match.id}`);
    const history = playerPage.getByRole('region', { name: 'Historial de reservas', exact: true });
    await expect(history.getByRole('heading', { name: 'Partido cancelado por el organizador', exact: true })).toBeVisible();
    await expect(history).toContainText('Motivo del organizador: La cancha cerró por reparaciones');
    await expect(history.getByText('Cancelada por el organizador', { exact: true })).toBeVisible();
    await expect(playerPage.getByRole('button', { name: 'Inscribirme', exact: true })).toHaveCount(0);
    await playerPage.goto('/mis-partidos');
    await playerPage.getByRole('button', { name: 'Reservados', exact: true }).click();
    await playerPage.getByRole('button', { name: 'Cancelados', exact: true }).click();
    await expect(playerPage.getByText(match.venueName, { exact: true })).toBeVisible();
    await expect(playerPage.getByText(/^Cancelada por el organizador\./)).toBeVisible();

    const formerPage = await formerContext.newPage();
    await login(formerPage, data.former.email);
    await formerPage.goto(`/partidos/${match.id}`);
    const formerHistory = formerPage.getByRole('region', { name: 'Historial de reservas', exact: true });
    await expect(formerHistory.getByText('Cancelaste tu reserva', { exact: true })).toBeVisible();
    await expect(formerHistory).not.toContainText('La cancha cerró por reparaciones');
    const formerHistoryResponse = await formerContext.request.get(`${api}/matches/${match.id}/reservations/history`);
    expect((await formerHistoryResponse.json()).matchCancellation).toBeNull();
    const publicResponse = await browser.newContext();
    try {
      const response = await publicResponse.request.get(`${api}/matches/${match.id}`);
      expect(await response.text()).not.toContain('La cancha cerró por reparaciones');
    } finally { await publicResponse.close(); }
  } finally {
    await playerContext.close();
    await formerContext.close();
    await data.cleanup();
  }
});

test('reserved matches paginate distinct matches and reset the page when role or state changes', async ({ page, context }) => {
  test.setTimeout(120_000);
  const data = await fixture();
  try {
    const upcoming: { id: string; venueName: string }[] = [];
    for (let index = 1; index <= 10; index++) {
      const match = await data.match(index + 30, 3);
      if (index === 1) await data.reservation(data.player.id, match.id, match.localDate, 1, true);
      await data.reservation(data.player.id, match.id, match.localDate, 1);
      upcoming.push(match);
    }
    const past = await data.match(-2, 3);
    await data.reservation(data.player.id, past.id, past.localDate, 1);
    const voluntary = await data.match(60);
    await data.reservation(data.player.id, voluntary.id, voluntary.localDate, 2, true);
    await login(page, data.player.email);
    await page.goto('/mis-partidos');
    const roles = page.getByRole('group', { name: 'Participación en mis partidos', exact: true });
    await roles.getByRole('button', { name: 'Reservados', exact: true }).click();
    await expect(page.getByText('10 partidos', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Ver partido en / })).toHaveCount(9);
    await expect(page.getByText(upcoming[0].venueName, { exact: true })).toHaveCount(1);
    const response = await context.request.get(`${api}/users/me/matches?role=player&filter=upcoming&page=1`);
    const firstPage = await response.json();
    expect(firstPage).toMatchObject({ total: 10, page: 1, pageSize: 9, hasMore: true });
    expect(new Set(firstPage.items.map((item: { id: string }) => item.id)).size).toBe(9);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByText('Página 2', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Ver partido en / })).toHaveCount(1);
    await expect(page.getByText(upcoming[9].venueName, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pasados', exact: true }).click();
    await expect(page.getByText('Página 1', { exact: true })).toBeVisible();
    await expect(page.getByText(past.venueName, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelados', exact: true }).click();
    await expect(page.getByText(voluntary.venueName, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Cancelaste tu reserva\./)).toBeVisible();
    await expect(page.getByText(upcoming[0].venueName, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Próximos', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByText('Página 2', { exact: true })).toBeVisible();
    await roles.getByRole('button', { name: 'Organizados', exact: true }).click();
    await expect(page.getByText('Todavía no tenés partidos próximos', { exact: true })).toBeVisible();
    await roles.getByRole('button', { name: 'Reservados', exact: true }).click();
    await expect(page.getByText('Página 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Ver partido en / })).toHaveCount(9);
  } finally { await data.cleanup(); }
});

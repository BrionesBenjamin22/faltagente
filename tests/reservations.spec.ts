import { randomUUID } from 'node:crypto';
import { test, expect, api, prismaFixture, hashFixturePassword } from './support/harness';

const password = 'Reservation browser password 123!';

test('reserves, cancels with recovery, reopens places and preserves paginated private history', async ({ page, context }) => {
  test.setTimeout(120_000);
  const db = prismaFixture();
  const suffix = randomUUID();
  const email = `reservation-player-${suffix}@example.test`;
  const userIds: string[] = [];
  let matchId: string | undefined;
  try {
    const location = await db.location.findUniqueOrThrow({ where: { seedKey: 'la-plata-tolosa' } });
    const sport = await db.sport.findUniqueOrThrow({ where: { slug: 'futbol' } });
    const organizer = await db.user.create({ data: { name: 'Browser organizer', email: `reservation-organizer-${suffix}@example.test` } });
    userIds.push(organizer.id);
    const player = await db.user.create({ data: { name: 'Browser player', email, passwordHash: await hashFixturePassword(password), primaryLocationId: location.id } });
    userIds.push(player.id);
    const startsAt = new Date(Date.now() + 7 * 86400000);
    const match = await db.match.create({ data: {
      organizerId: organizer.id, locationId: location.id, sportId: sport.id, startsAt,
      venueName: `Browser reservation ${suffix}`, address: 'Calle de prueba 123', pricePerPerson: 4000, availablePlaces: 3, totalPlaces: 3,
    } });
    matchId = match.id;
    const [{ localDate }] = await db.$queryRaw`SELECT (${startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"`;
    await db.participation.create({ data: { userId: organizer.id, matchId, localDate, role: 'ORGANIZER' } });
    await page.goto(`/partidos/${matchId}`);
    await expect(page.getByText('3 lugares disponibles', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inscribirme', exact: true })).toHaveCount(0);
    await page.goto('/auth/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    await page.goto(`/partidos/${matchId}`);
    await page.getByLabel('Cantidad de lugares', { exact: true }).fill('2');
    const confirmation = page.waitForResponse(response => response.url() === `${api}/matches/${matchId}/reservations` && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
    expect((await confirmation).status()).toBe(201);
    await expect(page.getByText('Inscripción confirmada', { exact: true })).toBeVisible();
    await expect(page.getByText('1 lugar disponible', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Inscripción confirmada', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inscribirme', exact: true })).toHaveCount(0);
    const own = await context.request.get(`${api}/matches/${matchId}/reservations/me`);
    expect(own.status()).toBe(200);
    expect(await own.json()).toMatchObject({ matchId, places: 2 });
    expect(await db.reservation.count({ where: { userId: player.id, matchId } })).toBe(1);
    expect(await db.participation.findUnique({ where: { userId_matchId: { userId: player.id, matchId } } })).toMatchObject({ role: 'PLAYER', active: true });
    expect(await db.match.findUniqueOrThrow({ where: { id: matchId } })).toMatchObject({ availablePlaces: 1, totalPlaces: 3 });

    const cancelButton = page.getByRole('button', { name: 'Cancelar reserva', exact: true });
    const cancellation = page.getByRole('region', { name: 'Cancelar reserva', exact: true });
    await cancelButton.click();
    await expect(cancellation).toContainText('2 lugares');
    await cancellation.getByLabel('Motivo de cancelación (opcional)', { exact: true }).fill('No cancelar todavía');
    await cancellation.getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(cancellation).toHaveCount(0);
    expect(await db.reservation.count({ where: { userId: player.id, matchId, status: 'CONFIRMED' } })).toBe(1);
    expect((await db.match.findUniqueOrThrow({ where: { id: matchId } })).availablePlaces).toBe(1);

    await cancelButton.click();
    const reason = cancellation.getByLabel('Motivo de cancelación (opcional)', { exact: true });
    await reason.fill('  No puedo asistir  ');
    let failCancellation = true;
    await page.route(`${api}/matches/${matchId}/reservations/*/cancel`, async route => {
      if (route.request().method() === 'POST' && failCancellation) {
        failCancellation = false;
        await route.abort('failed');
      } else await route.continue();
    });
    await cancellation.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    await expect(cancellation.getByRole('alert')).toContainText(/intent[áe] nuevamente/i);
    await expect(reason).toHaveValue('  No puedo asistir  ');
    expect((await db.match.findUniqueOrThrow({ where: { id: matchId } })).availablePlaces).toBe(1);
    await cancellation.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    await expect(page.getByText('Reserva cancelada correctamente', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/partidos/${matchId}$`));
    await expect(page.getByText('3 lugares disponibles', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inscribirme', exact: true })).toBeVisible();
    const history = page.getByRole('region', { name: 'Historial de reservas', exact: true });
    await expect(history.getByText('No puedo asistir', { exact: true })).toBeVisible();
    const firstReservation = await db.reservation.findFirstOrThrow({ where: { userId: player.id, matchId } });
    expect(firstReservation).toMatchObject({ status: 'CANCELLED', cancellationReason: 'No puedo asistir', places: 2 });
    expect(firstReservation.cancelledAt).toBeInstanceOf(Date);
    expect(await db.participation.findUnique({ where: { userId_matchId: { userId: player.id, matchId } } })).toMatchObject({ active: false });
    expect(await (await context.request.get(`${api}/matches/${matchId}/reservations/me`)).json()).toBeNull();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Inscribirme', exact: true })).toBeVisible();
    await expect(history.getByText('No puedo asistir', { exact: true })).toBeVisible();

    // Three new bookings keep the original cancellation and require a second history page.
    // Filling all places also exercises CLOSED -> OPEN when each reservation is cancelled.
    for (let index = 1; index <= 3; index++) {
      await page.getByLabel('Cantidad de lugares', { exact: true }).fill('3');
      await page.getByRole('button', { name: 'Inscribirme', exact: true }).click();
      await expect(page.getByText('Inscripción confirmada', { exact: true })).toBeVisible();
      expect(await db.match.findUniqueOrThrow({ where: { id: matchId } })).toMatchObject({ availablePlaces: 0, status: 'CLOSED' });
      await cancelButton.click();
      await reason.fill(`Cambio de planes ${index}`);
      await cancellation.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Inscribirme', exact: true })).toBeVisible();
      await expect(history.getByText(`Cambio de planes ${index}`, { exact: true })).toBeVisible();
      expect(await db.match.findUniqueOrThrow({ where: { id: matchId } })).toMatchObject({ availablePlaces: 3, status: 'OPEN' });
    }
    expect(await db.reservation.count({ where: { userId: player.id, matchId, status: 'CANCELLED' } })).toBe(4);
    expect(await db.participation.count({ where: { userId: player.id, matchId } })).toBe(1);
    await expect(history.getByText('No puedo asistir', { exact: true })).toHaveCount(0);
    const pagination = page.getByRole('navigation', { name: 'Paginación del historial de reservas', exact: true });
    await pagination.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(history.getByText('No puedo asistir', { exact: true })).toBeVisible();
    await expect(history.getByText('Cambio de planes 3', { exact: true })).toHaveCount(0);
    await expect(pagination.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
    await pagination.getByRole('button', { name: 'Anterior', exact: true }).click();
    await expect(history.getByText('Cambio de planes 3', { exact: true })).toBeVisible();
  } finally {
    if (matchId) {
      await db.reservation.deleteMany({ where: { matchId } });
      await db.participation.deleteMany({ where: { matchId } });
      await db.match.deleteMany({ where: { id: matchId } });
    }
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});

import { randomUUID } from 'node:crypto';
import { test, expect, api, prismaFixture, hashFixturePassword } from './support/harness';

const password = 'Reservation browser password 123!';

test('available places can be reserved and the confirmation survives reload', async ({ page, context }) => {
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

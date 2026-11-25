import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Tx } from '../waitlist/waitlist.domain.js';
import {
  databaseTime,
  invalidateSameDay,
} from '../waitlist/waitlist.domain.js';
const projection = {
  id: true,
  matchId: true,
  places: true,
  createdAt: true,
} as const;
const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
// Caller owns the booking-domain transaction lock. Shared by direct and offer confirmation.
export async function confirmReservation(
  tx: Tx,
  userId: string,
  matchId: string,
  places: number,
) {
  // Confirmation locks user before match. Match-wide cancellation only
  // releases participation under the same match lock.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
  const existing = await tx.reservation.findFirst({
    where: { userId, matchId, status: 'CONFIRMED' },
    select: projection,
  });
  if (existing) {
    if (existing.places !== places)
      throw conflict(
        'RESERVATION_ALREADY_EXISTS',
        'Ya tenés una reserva en este partido.',
      );
    return existing;
  }
  const match = await tx.match.findUnique({ where: { id: matchId } });
  const now = await databaseTime(tx);
  if (!match) throw new NotFoundException();
  if (match.organizerId === userId)
    throw conflict('OWN_MATCH', 'No podés reservar tu propio partido.');
  if (match.status !== 'OPEN' || match.startsAt <= now)
    throw conflict(
      'MATCH_UNAVAILABLE',
      'El partido no está disponible para inscripciones.',
    );
  if (match.availablePlaces < places)
    throw conflict('MATCH_FULL', 'No quedan suficientes lugares disponibles.');
  const [{ localDate }] = await tx.$queryRaw<{ localDate: Date }[]>`
        SELECT (${match.startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"
      `;
  if (
    await tx.participation.findFirst({
      where: { userId, localDate, active: true },
      select: { id: true },
    })
  ) {
    throw conflict(
      'DAILY_PARTICIPATION_CONFLICT',
      'Ya participás en un partido en esta fecha.',
    );
  }
  const participation = await tx.participation.findUnique({
    where: { userId_matchId: { userId, matchId } },
  });
  if (
    participation &&
    (participation.active || participation.role !== 'PLAYER')
  )
    throw conflict(
      'RESERVATION_INCONSISTENT',
      'No pudimos confirmar la inscripción. Recargue el partido e intente nuevamente.',
    );
  const changed = await tx.match.updateMany({
    where: {
      id: matchId,
      status: 'OPEN',
      startsAt: { gt: now },
      availablePlaces: { gte: places },
    },
    data: {
      availablePlaces: { decrement: places },
      version: { increment: 1 },
    },
  });
  if (!changed.count)
    throw conflict('MATCH_UNAVAILABLE', 'El partido ya no está disponible.');
  if (match.availablePlaces === places)
    await tx.match.update({
      where: { id: matchId },
      data: { status: 'CLOSED' },
    });
  await tx.participation.upsert({
    where: { userId_matchId: { userId, matchId } },
    create: { userId, matchId, role: 'PLAYER', localDate },
    update: { active: true, localDate },
  });
  const reservation = await tx.reservation.create({
    data: { userId, matchId, places },
    select: projection,
  });
  await invalidateSameDay(tx, userId, localDate);
  return reservation;
}

import type { Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
export const activeEntries = ['WAITING', 'OFFERED'] as const;

// All capacity / daily-participation writers take this lock FIRST. It also
// orders event sequence allocation by commit, so cursor consumers cannot skip.
export async function lockBookingDomain(tx: Tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(17312025, 1)::text`;
}
export async function databaseTime(tx: Tx): Promise<Date> {
  const [row] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS "now"`;
  return row.now;
}
export async function localDay(tx: Tx, startsAt: Date) {
  const [row] = await tx.$queryRaw<
    { localDate: Date }[]
  >`SELECT (${startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"`;
  return row.localDate;
}
export function bestFit<
  T extends { id: string; places: number; createdAt: Date },
>(entries: T[], available: number): T | undefined {
  return entries
    .filter((e) => e.places <= available)
    .sort(
      (a, b) =>
        b.places - a.places ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    )[0];
}
type Entry = { id: string; userId: string; matchId: string; places: number };
export async function recordWaitlistEvent(
  tx: Tx,
  entry: Entry,
  type: string,
  reason?: string,
  offer?: { id: string; expiresAt: Date },
) {
  await tx.waitlistEvent.create({
    data: {
      recipientId: entry.userId,
      matchId: entry.matchId,
      entryId: entry.id,
      places: entry.places,
      type,
      reason,
      offerId: offer?.id,
      expiresAt: offer?.expiresAt,
    },
  });
}
export async function heldPlaces(tx: Tx, matchId: string) {
  const sum = await tx.waitlistOffer.aggregate({
    where: { status: 'PENDING', entry: { matchId } },
    _sum: { places: true },
  });
  return sum._sum.places ?? 0;
}
export async function finishEntry(
  tx: Tx,
  entryId: string,
  status: 'LEFT' | 'COMPLETED' | 'EXPIRED' | 'INVALIDATED',
  reason: string,
  offerStatus: 'REJECTED' | 'EXPIRED' | 'INVALIDATED' = 'INVALIDATED',
) {
  const entry = await tx.waitlistEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { offer: true },
  });
  if (entry.status !== 'WAITING' && entry.status !== 'OFFERED') return;
  const now = await databaseTime(tx);
  if (entry.offer?.status === 'PENDING') {
    await tx.waitlistOffer.update({
      where: { id: entry.offer.id },
      data: { status: offerStatus, resolvedAt: now },
    });
    const match = await tx.match.findUniqueOrThrow({
      where: { id: entry.matchId },
    });
    if (match.status !== 'CANCELLED')
      await tx.match.update({
        where: { id: match.id },
        data: {
          availablePlaces: { increment: entry.places },
          status: 'OPEN',
          version: { increment: 1 },
        },
      });
    await recordWaitlistEvent(
      tx,
      entry,
      'OFFER_' + offerStatus,
      reason,
      entry.offer,
    );
  }
  await tx.waitlistEntry.update({ where: { id: entryId }, data: { status } });
  await recordWaitlistEvent(
    tx,
    entry,
    'ENTRY_' + status,
    reason,
    entry.offer ?? undefined,
  );
}
// Caller holds domain lock. Only this match is scanned on interactive mutations.
export async function allocateOffers(tx: Tx, matchId: string) {
  const match = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { sport: { select: { name: true } } },
  });
  const now = await databaseTime(tx);
  if (
    match.status === 'CANCELLED' ||
    match.startsAt <= now ||
    match.availablePlaces <= 0
  )
    return;
  let available = match.availablePlaces;
  const day = await localDay(tx, match.startsAt);
  while (available > 0) {
    const entry = await tx.waitlistEntry.findFirst({
      where: {
        matchId,
        status: 'WAITING',
        places: { lte: available },
        user: { participations: { none: { localDate: day, active: true } } },
      },
      orderBy: [{ places: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!entry) break;
    const issuedAt = await databaseTime(tx);
    if (match.startsAt <= issuedAt) break;
    const expiresAt = new Date(
      Math.min(issuedAt.getTime() + 15 * 60 * 1000, match.startsAt.getTime()),
    );
    const offer = await tx.waitlistOffer.create({
      data: { entryId: entry.id, places: entry.places, expiresAt },
    });
    await tx.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'OFFERED' },
    });
    available -= entry.places;
    await recordWaitlistEvent(tx, entry, 'OFFER_CREATED', undefined, offer);
    const notification = await tx.notification.create({
      data: {
        userId: entry.userId,
        type: 'WAITLIST_OFFER',
        title: 'Te ofrecieron lugares',
        body: `Tenés una oferta de ${entry.places} ${entry.places === 1 ? 'lugar' : 'lugares'} para ${match.sport.name}.`,
        detail: 'Aceptá la oferta antes de que expire.',
        relatedMatchId: matchId,
        dedupeKey: `WAITLIST_OFFER:${offer.id}`,
        metadata: { offerId: offer.id, expiresAt: offer.expiresAt },
      },
      select: { id: true },
    });
    await tx.notificationJob.create({
      data: {
        recipientId: entry.userId,
        eventKey: `WAITLIST_OFFER:${offer.id}`,
        kind: 'WAITLIST_OFFER',
        payload: {
          notificationId: notification.id,
          title: 'Falta Gente',
          body: 'Tenés una actualización nueva.',
          offerId: offer.id,
          matchId,
        },
      },
    });
  }
  if (available !== match.availablePlaces)
    await tx.match.update({
      where: { id: matchId },
      data: {
        availablePlaces: available,
        status: available === 0 ? 'CLOSED' : 'OPEN',
        version: { increment: 1 },
      },
    });
}
export async function settleMatch(tx: Tx, matchId: string) {
  const match = await tx.match.findUnique({ where: { id: matchId } });
  if (!match) return;
  const now = await databaseTime(tx);
  const entries = await tx.waitlistEntry.findMany({
    where: {
      matchId,
      status: { in: [...activeEntries] },
      ...(match.status === 'CANCELLED' || match.startsAt <= now
        ? {}
        : { offer: { is: { status: 'PENDING', expiresAt: { lte: now } } } }),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 200,
  });
  for (const entry of entries)
    await finishEntry(
      tx,
      entry.id,
      match.status === 'CANCELLED' ? 'INVALIDATED' : 'EXPIRED',
      match.status === 'CANCELLED'
        ? 'MATCH_CANCELLED'
        : match.startsAt <= now
          ? 'MATCH_STARTED'
          : 'OFFER_EXPIRED',
      match.status === 'CANCELLED' ? 'INVALIDATED' : 'EXPIRED',
    );
  await allocateOffers(tx, matchId);
}
export async function invalidateSameDay(tx: Tx, userId: string, day: Date) {
  const entries = await tx.waitlistEntry.findMany({
    where: { userId, status: { in: [...activeEntries] } },
    include: { match: { select: { startsAt: true } } },
  });
  const matches = new Set<string>();
  for (const entry of entries)
    if (
      (await localDay(tx, entry.match.startsAt)).getTime() === day.getTime()
    ) {
      await finishEntry(tx, entry.id, 'INVALIDATED', 'DAILY_PARTICIPATION');
      matches.add(entry.matchId);
    }
  for (const id of [...matches].sort()) await settleMatch(tx, id);
}

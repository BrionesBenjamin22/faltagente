import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module.js';
import {
  confirmReservation,
  reservationProjection,
} from '../matches/booking-core.js';
import {
  activeEntries,
  allocateOffers,
  databaseTime,
  finishEntry,
  localDay,
  lockBookingDomain,
  recordWaitlistEvent,
  settleMatch,
  type Tx,
} from './waitlist.domain.js';

const entryProjection = {
  id: true,
  matchId: true,
  places: true,
  status: true,
  createdAt: true,
  offer: {
    select: {
      id: true,
      status: true,
      places: true,
      expiresAt: true,
      reservationId: true,
    },
  },
} as const;
const matchProjection = {
  id: true,
  startsAt: true,
  venueName: true,
  address: true,
  status: true,
  availablePlaces: true,
  sport: { select: { id: true, name: true, slug: true } },
  sportFormat: { select: { id: true, name: true, slug: true } },
  location: { select: { id: true, name: true, type: true } },
} as const;
const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });

type EntryView = Prisma.WaitlistEntryGetPayload<{
  select: typeof entryProjection;
}>;
function effective(
  entry: EntryView,
  now: Date,
  match?: { startsAt: Date; status: string },
) {
  const expired =
    entry.offer?.status === 'PENDING' && entry.offer.expiresAt <= now;
  if (
    match?.status === 'CANCELLED' &&
    activeEntries.some((s) => s === entry.status)
  )
    return {
      ...entry,
      status: 'INVALIDATED',
      offer: entry.offer ? { ...entry.offer, status: 'INVALIDATED' } : null,
    };
  if (
    expired ||
    (match &&
      match.startsAt <= now &&
      activeEntries.some((s) => s === entry.status))
  )
    return {
      ...entry,
      status: 'EXPIRED',
      offer: entry.offer
        ? {
            ...entry.offer,
            status:
              entry.offer.status === 'PENDING' ? 'EXPIRED' : entry.offer.status,
          }
        : null,
    };
  return entry;
}
@Injectable()
export class WaitlistService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly db: PrismaService) {}
  private readonly logger = new Logger(WaitlistService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.expireDue().catch(() =>
        this.logger.error('No se pudieron procesar las ofertas vencidas.'),
      );
    }, 30_000);
    this.timer.unref();
    void this.expireDue().catch(() =>
      this.logger.error('No se pudieron procesar las ofertas vencidas.'),
    );
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private write<T>(fn: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await lockBookingDomain(tx);
        return fn(tx);
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }
  async expireDue() {
    if (this.running) return;
    this.running = true;
    try {
      const now = await databaseTime(this.db);
      const rows = await this.db.waitlistEntry.findMany({
        where: {
          status: { in: [...activeEntries] },
          OR: [
            { match: { startsAt: { lte: now } } },
            { match: { status: 'CANCELLED' } },
            { offer: { is: { status: 'PENDING', expiresAt: { lte: now } } } },
          ],
        },
        select: { matchId: true },
        distinct: ['matchId'],
        take: 50,
      });
      for (const { matchId } of rows)
        await this.write((tx) => settleMatch(tx, matchId));
    } finally {
      this.running = false;
    }
  }
  async mine(userId: string, matchId: string) {
    return this.db.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { id: matchId },
          select: { startsAt: true, status: true },
        });
        if (!match) throw new NotFoundException();
        const entry = await tx.waitlistEntry.findFirst({
          where: { userId, matchId },
          select: entryProjection,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        return entry ? effective(entry, await databaseTime(tx), match) : null;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async join(userId: string, matchId: string, places: number) {
    return this.write(async (tx) => {
      await settleMatch(tx, matchId);
      const match = await tx.match.findUnique({ where: { id: matchId } });
      if (!match) throw new NotFoundException();
      const existing = await tx.waitlistEntry.findFirst({
        where: { userId, matchId, status: { in: [...activeEntries] } },
        select: entryProjection,
      });
      if (existing) {
        if (existing.places !== places)
          throw conflict(
            'WAITLIST_ALREADY_EXISTS',
            'Ya est\u00e1s en esta lista. Abandonala antes de cambiar la cantidad de lugares.',
          );
        return existing;
      }
      if (match.organizerId === userId)
        throw conflict(
          'OWN_MATCH',
          'No pod\u00e9s entrar en la lista de tu propio partido.',
        );
      if (
        match.status === 'CANCELLED' ||
        match.startsAt <= (await databaseTime(tx))
      )
        throw conflict(
          'MATCH_UNAVAILABLE',
          'El partido ya no est\u00e1 disponible.',
        );
      if (match.availablePlaces !== 0)
        throw conflict(
          'WAITLIST_MATCH_NOT_FULL',
          'Hay lugares disponibles. Revis\u00e1 el partido para reservar.',
        );
      if (places > match.totalPlaces)
        throw conflict(
          'WAITLIST_PLACES_INVALID',
          'Solicit\u00e1 una cantidad de lugares que no supere la capacidad del partido.',
        );
      const localDate = await localDay(tx, match.startsAt);
      if (
        await tx.participation.findFirst({
          where: { userId, localDate, active: true },
          select: { id: true },
        })
      )
        throw conflict(
          'DAILY_PARTICIPATION_CONFLICT',
          'Ya particip\u00e1s en un partido en esta fecha.',
        );
      const entry = await tx.waitlistEntry.create({
        data: { userId, matchId, places },
        select: { ...entryProjection, userId: true },
      });
      await recordWaitlistEvent(tx, entry, 'ENTRY_JOINED');
      const { userId: _userId, ...result } = entry;
      return result;
    });
  }
  async leave(userId: string, matchId: string, entryId: string) {
    return this.write(async (tx) => {
      const entry = await tx.waitlistEntry.findFirst({
        where: { id: entryId, userId, matchId },
        select: { id: true },
      });
      if (!entry) throw new NotFoundException();
      await settleMatch(tx, matchId);
      await finishEntry(tx, entryId, 'LEFT', 'USER_LEFT');
      await allocateOffers(tx, matchId);
      return tx.waitlistEntry.findUniqueOrThrow({
        where: { id: entryId },
        select: entryProjection,
      });
    });
  }
  async resolve(userId: string, offerId: string, accept: boolean) {
    const result = await this.write(async (tx) => {
      const offer = await tx.waitlistOffer.findFirst({
        where: { id: offerId, entry: { userId } },
        include: { entry: true },
      });
      if (!offer) throw new NotFoundException();
      if (accept && offer.status === 'ACCEPTED' && offer.reservationId)
        return {
          reservation: await tx.reservation.findUniqueOrThrow({
            where: { id: offer.reservationId },
            select: reservationProjection,
          }),
        };
      await settleMatch(tx, offer.entry.matchId);
      const current = await tx.waitlistOffer.findUniqueOrThrow({
        where: { id: offerId },
      });
      if (!accept && current.status === 'REJECTED')
        return {
          entry: await tx.waitlistEntry.findUniqueOrThrow({
            where: { id: offer.entryId },
            select: entryProjection,
          }),
        };
      if (current.status !== 'PENDING') return { unavailable: true };
      if (!accept) {
        await finishEntry(
          tx,
          offer.entryId,
          'COMPLETED',
          'USER_REJECTED',
          'REJECTED',
        );
        await allocateOffers(tx, offer.entry.matchId);
        return {
          entry: await tx.waitlistEntry.findUniqueOrThrow({
            where: { id: offer.entryId },
            select: entryProjection,
          }),
        };
      }
      // The deadline is checked from database time after acquiring all domain locks.
      const now = await databaseTime(tx);
      if (current.expiresAt <= now) {
        await settleMatch(tx, offer.entry.matchId);
        return { unavailable: true };
      }
      // Convert the protected allocation into available capacity inside this same
      // transaction, then use the one reservation-confirmation implementation.
      await tx.waitlistEntry.update({
        where: { id: offer.entryId },
        data: { status: 'COMPLETED' },
      });
      await tx.match.update({
        where: { id: offer.entry.matchId },
        data: { availablePlaces: { increment: offer.places }, status: 'OPEN' },
      });
      const reservation = await confirmReservation(
        tx,
        userId,
        offer.entry.matchId,
        offer.places,
      );
      const resolvedAt = await databaseTime(tx);
      // If confirmation crossed the deadline, rollback rather than accept late.
      if (resolvedAt >= current.expiresAt)
        throw conflict(
          'WAITLIST_OFFER_UNAVAILABLE',
          'La oferta venci\u00f3. Actualiz\u00e1 el partido para continuar.',
        );
      await tx.waitlistOffer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED', resolvedAt, reservationId: reservation.id },
      });
      await recordWaitlistEvent(
        tx,
        offer.entry,
        'OFFER_ACCEPTED',
        undefined,
        offer,
      );
      await recordWaitlistEvent(
        tx,
        offer.entry,
        'ENTRY_COMPLETED',
        'OFFER_ACCEPTED',
        offer,
      );
      return { reservation };
    });
    if ('unavailable' in result)
      throw conflict(
        'WAITLIST_OFFER_UNAVAILABLE',
        'La oferta ya no est\u00e1 disponible. Actualiz\u00e1 el partido para continuar.',
      );
    return 'reservation' in result ? result.reservation : result.entry;
  }
  async organizer(userId: string, matchId: string, page: number) {
    return this.db.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { id: matchId },
          select: { organizerId: true, startsAt: true, status: true },
        });
        if (!match) throw new NotFoundException();
        if (match.organizerId !== userId)
          throw new ForbiddenException({
            code: 'WAITLIST_FORBIDDEN',
            message: 'S\u00f3lo el organizador puede consultar esta lista.',
          });
        const where = { matchId, status: { in: [...activeEntries] } };
        const [rows, total] = await Promise.all([
          tx.waitlistEntry.findMany({
            where,
            select: {
              ...entryProjection,
              user: { select: { id: true, name: true } },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 9,
            skip: (page - 1) * 9,
          }),
          tx.waitlistEntry.count({ where }),
        ]);
        const now = await databaseTime(tx);
        return {
          items: rows.map((row) => ({
            ...effective(row, now, match),
            user: row.user,
          })),
          total,
          page,
          pageSize: 9,
          hasMore: page * 9 < total,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async ownList(userId: string, page: number) {
    return this.db.$transaction(
      async (tx) => {
        const where = { userId, status: { in: [...activeEntries] } };
        const [rows, total] = await Promise.all([
          tx.waitlistEntry.findMany({
            where,
            select: { ...entryProjection, match: { select: matchProjection } },
            orderBy: [
              { match: { startsAt: 'asc' } },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            take: 9,
            skip: (page - 1) * 9,
          }),
          tx.waitlistEntry.count({ where }),
        ]);
        const now = await databaseTime(tx);
        return {
          items: rows.map((row) => ({
            ...effective(row, now, row.match),
            match: row.match,
          })),
          total,
          page,
          pageSize: 9,
          hasMore: page * 9 < total,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}

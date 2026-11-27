import { recordCancellation } from './reservation-cancellations.domain.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  databaseTime,
  lockBookingDomain,
  settleMatch,
  allocateOffers,
  heldPlaces,
  finishEntry,
  invalidateSameDay,
} from '../waitlist/waitlist.domain.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module.js';
import type { CreateMatchDto } from './dto/match-publication.dto.js';
import type { CancelMatchDto, UpdateMatchDto } from './dto/match-update.dto.js';
import type { MyMatchesQueryDto } from './dto/my-matches.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class MatchManagementService {
  constructor(
    private readonly db: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async ownList(userId: string, query: MyMatchesQueryDto) {
    const now = new Date();
    const playerRole = query.role === 'player';
    const where: Prisma.MatchWhereInput = {
      ...(playerRole
        ? {
            reservations: {
              some: {
                userId,
                status:
                  query.filter === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
              },
            },
            ...(query.filter === 'cancelled'
              ? {
                  NOT: {
                    reservations: { some: { userId, status: 'CONFIRMED' } },
                  },
                }
              : {}),
          }
        : { organizerId: userId }),
      ...(query.filter === 'cancelled'
        ? playerRole
          ? {}
          : { status: 'CANCELLED' as const }
        : {
            status: { in: ['OPEN', 'CLOSED'] },
            startsAt: query.filter === 'past' ? { lte: now } : { gt: now },
          }),
    };
    const direction = query.filter === 'upcoming' ? 'asc' : 'desc';
    const [items, total] = await this.db.$transaction(
      [
        this.db.match.findMany({
          where,
          select: {
            id: true,
            startsAt: true,
            venueName: true,
            address: true,
            pricePerPerson: true,
            availablePlaces: true,
            status: true,
            description: true,
            location: { select: { id: true, name: true, type: true } },
            sport: { select: { id: true, name: true, slug: true } },
            sportFormat: { select: { id: true, name: true, slug: true } },
            ...(playerRole
              ? {
                  reservations: {
                    where: {
                      userId,
                      status:
                        query.filter === 'cancelled'
                          ? ('CANCELLED' as const)
                          : ('CONFIRMED' as const),
                    },
                    select: {
                      id: true,
                      places: true,
                      status: true,
                      cancellationSource: true,
                      cancelledAt: true,
                    },
                    orderBy: [
                      { createdAt: 'desc' as const },
                      { id: 'desc' as const },
                    ],
                    take: 1,
                  },
                }
              : {}),
          },
          orderBy: [{ startsAt: direction }, { id: direction }],
          take: 9,
          skip: (query.page - 1) * 9,
        }),
        this.db.match.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: playerRole
        ? items.map(({ reservations, ...match }) => ({
            ...match,
            reservation: reservations[0],
          }))
        : items,
      total,
      page: query.page,
      pageSize: 9,
      hasMore: query.page * 9 < total,
    };
  }

  async create(userId: string, dto: CreateMatchDto) {
    try {
      return await this.db.$transaction(async (tx) => {
        await lockBookingDomain(tx);
        // Shared lock order: users (sorted by id when several), then match.
        // Lock the user before checking their local-day participation.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const startsAt = new Date(dto.startsAt);
        if (startsAt <= new Date())
          throw new BadRequestException({
            code: 'MATCH_START_INVALID',
            message:
              'Seleccione una fecha y hora futuras para publicar el partido.',
          });
        const [sport, location, format] = await Promise.all([
          tx.sport.findFirst({
            where: { id: dto.sportId, active: true },
            select: { id: true },
          }),
          tx.location.findFirst({
            where: {
              id: dto.locationId,
              active: true,
              type: { in: ['LOCALIDAD', 'BARRIO', 'ZONA'] },
            },
            select: { id: true },
          }),
          dto.sportFormatId
            ? tx.sportFormat.findFirst({
                where: {
                  id: dto.sportFormatId,
                  sportId: dto.sportId,
                  active: true,
                },
                select: { id: true },
              })
            : null,
        ]);
        if (!sport)
          throw new BadRequestException({
            code: 'SPORT_INVALID',
            message: 'Seleccione un deporte disponible e intente nuevamente.',
          });
        if (!location)
          throw new BadRequestException({
            code: 'LOCATION_INVALID',
            message:
              'Seleccione una localidad disponible e intente nuevamente.',
          });
        if (dto.sportFormatId && !format)
          throw new BadRequestException({
            code: 'SPORT_FORMAT_INVALID',
            message:
              'Seleccione un formato disponible para el deporte elegido.',
          });
        const [{ localDate }] = await tx.$queryRaw<{ localDate: Date }[]>`
        SELECT (${startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"
      `;
        if (
          await tx.participation.findFirst({
            where: { userId, localDate, active: true },
            select: { id: true },
          })
        ) {
          throw this.dateConflict();
        }
        const fields = {
          sportId: dto.sportId,
          sportFormatId: dto.sportFormatId ?? null,
          locationId: dto.locationId,
          startsAt: startsAt.toISOString(),
          placeName: dto.placeName,
          address: dto.address,
          pricePerPerson: new Prisma.Decimal(dto.pricePerPerson).toString(),
          totalPlaces: dto.totalPlaces,
          description: dto.description || null,
        };
        const changes: Record<string, Prisma.InputJsonValue> = {};
        for (const [field, value] of Object.entries(fields))
          changes[field] = { before: null, after: value };
        const match = await tx.match.create({
          data: {
            organizerId: userId,
            locationId: fields.locationId,
            sportId: fields.sportId,
            sportFormatId: fields.sportFormatId,
            startsAt,
            venueName: fields.placeName,
            address: fields.address,
            pricePerPerson: fields.pricePerPerson,
            totalPlaces: fields.totalPlaces,
            availablePlaces: fields.totalPlaces,
            description: fields.description,
            participations: {
              create: { userId, role: 'ORGANIZER', localDate },
            },
            changes: {
              create: { actorId: userId, event: 'PUBLISHED', changes },
            },
          },
          select: { id: true },
        });
        await invalidateSameDay(tx, userId, localDate);
        return match;
      }, { maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      // The partial unique index also protects against future participation writers.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw this.dateConflict();
      throw error;
    }
  }

  private dateConflict() {
    return new ConflictException({
      code: 'PARTICIPATION_DATE_CONFLICT',
      message:
        'Ya participa en un partido en esa fecha. Seleccione otro día para publicar.',
    });
  }

  private async ownMatch(
    userId: string,
    id: string,
    db: Prisma.TransactionClient = this.db,
  ) {
    const match = await db.match.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        totalPlaces: true,
        availablePlaces: true,
        version: true,
        status: true,
        startsAt: true,
        venueName: true,
        address: true,
        pricePerPerson: true,
        description: true,
        cancelledAt: true,
        cancellationReason: true,
        sportId: true,
        sportFormatId: true,
        locationId: true,
        sport: { select: { id: true, name: true, slug: true, active: true } },
        sportFormat: {
          select: { id: true, name: true, slug: true, active: true },
        },
        location: {
          select: { id: true, name: true, type: true, active: true },
        },
        _count: {
          select: {
            participations: { where: { role: 'PLAYER', active: true } },
          },
        },
      },
    });
    if (!match) throw new NotFoundException();
    if (match.organizerId !== userId)
      throw new ForbiddenException({
        code: 'MATCH_MANAGEMENT_FORBIDDEN',
        message:
          'Sólo el organizador puede consultar la gestión de este partido.',
      });
    return match;
  }

  async management(userId: string, id: string) {
    return this.db.$transaction(
      async (tx) => this.managementSnapshot(tx, userId, id),
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private async managementSnapshot(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const match = await this.ownMatch(userId, id, tx);
    const held = await heldPlaces(tx, id);
    const activeWaitlistCount = await tx.waitlistEntry.count({
      where: { matchId: id, status: { in: ['WAITING', 'OFFERED'] } },
    });
    const occupiedPlaces = match.totalPlaces - match.availablePlaces - held;
    const activePlayerCount = match._count.participations;
    const hasConfirmedParticipants =
      activePlayerCount > 0 || occupiedPlaces > 0;
    const canEdit = match.status !== 'CANCELLED' && match.startsAt > new Date();
    return {
      id: match.id,
      sport: {
        id: match.sport.id,
        name: match.sport.name,
        slug: match.sport.slug,
        active: match.sport.active,
      },
      sportFormat: match.sportFormat
        ? {
            id: match.sportFormat.id,
            name: match.sportFormat.name,
            slug: match.sportFormat.slug,
            active: match.sportFormat.active,
          }
        : null,
      location: {
        id: match.location.id,
        name: match.location.name,
        type: match.location.type,
        active: match.location.active,
      },
      startsAt: match.startsAt,
      placeName: match.venueName,
      address: match.address,
      description: match.description,
      status: match.status,
      cancelledAt: match.cancelledAt,
      cancellationReason: match.cancellationReason,
      totalPlaces: match.totalPlaces,
      availablePlaces: match.availablePlaces,
      version: match.version,
      pricePerPerson: match.pricePerPerson.toString(),
      occupiedPlaces,
      heldPlaces: held,
      activeWaitlistCount,
      hasActiveWaitlist: activeWaitlistCount > 0,
      activePlayerCount,
      hasConfirmedParticipants,
      canEdit,
      canCancel: canEdit,
      canAdjustCapacity:
        canEdit && this.capacityConsistent(occupiedPlaces, activePlayerCount),
    };
  }

  private capacityConsistent(occupied: number, players: number) {
    // Each active player represents a reservation of one or more places.
    return (
      (occupied === 0 && players === 0) ||
      (occupied > 0 && players > 0 && players <= occupied)
    );
  }

  private async lockedMatch(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    await lockBookingDomain(tx);
    await settleMatch(tx, id);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const match = await tx.match.findUnique({
      where: { id },
      include: {
        sport: true,
        sportFormat: true,
        location: true,
        _count: {
          select: {
            participations: { where: { role: 'PLAYER', active: true } },
          },
        },
      },
    });
    if (!match) throw new NotFoundException();
    if (match.organizerId !== userId)
      throw new ForbiddenException({
        code: 'MATCH_MANAGEMENT_FORBIDDEN',
        message: 'Sólo el organizador puede modificar este partido.',
      });
    return match;
  }

  private checkVersion(actual: number, expected: number) {
    if (actual !== expected)
      throw new ConflictException({
        code: 'MATCH_VERSION_CONFLICT',
        message:
          'El partido cambió. Recargue la versión actual y revise los cambios antes de guardar.',
      });
  }

  private checkFuture(match: { startsAt: Date; status: string }) {
    if (match.status === 'CANCELLED' || match.startsAt <= new Date())
      throw new ConflictException({
        code: 'MATCH_NOT_EDITABLE',
        message:
          'Sólo puede modificar partidos futuros que no estén cancelados. Vuelva al detalle.',
      });
  }

  async update(userId: string, id: string, dto: UpdateMatchDto) {
    let hasChanged = false;
    try {
      const result = await this.db.$transaction(async (tx) => {
        const match = await this.lockedMatch(tx, userId, id);
        this.checkVersion(match.version, dto.expectedVersion);
        this.checkFuture(match);
        const before = {
          sportId: match.sportId,
          sportFormatId: match.sportFormatId,
          locationId: match.locationId,
          startsAt: match.startsAt.toISOString(),
          placeName: match.venueName.trim(),
          address: match.address.trim(),
          pricePerPerson: match.pricePerPerson.toString(),
          totalPlaces: match.totalPlaces,
          description: match.description?.trim() || null,
        };
        const after = { ...before };
        if (dto.sportId !== undefined) after.sportId = dto.sportId;
        if (dto.sportFormatId !== undefined)
          after.sportFormatId = dto.sportFormatId;
        if (dto.locationId !== undefined) after.locationId = dto.locationId;
        if (dto.startsAt !== undefined)
          after.startsAt = new Date(dto.startsAt).toISOString();
        if (dto.placeName !== undefined)
          after.placeName = dto.placeName.trim();
        if (dto.address !== undefined) after.address = dto.address.trim();
        if (dto.pricePerPerson !== undefined)
          after.pricePerPerson = new Prisma.Decimal(
            dto.pricePerPerson,
          ).toString();
        if (dto.totalPlaces !== undefined)
          after.totalPlaces = dto.totalPlaces;
        if (dto.description !== undefined)
          after.description = dto.description?.trim() || null;
        const changed = (
          Object.keys(before) as (keyof typeof before)[]
        ).filter((key) => before[key] !== after[key]);
        if (!changed.length) return { id };
        hasChanged = true;
        const held = await heldPlaces(tx, id);
        const activeWaitlistCount = await tx.waitlistEntry.count({
          where: { matchId: id, status: { in: ['WAITING', 'OFFERED'] } },
        });
        const occupied = match.totalPlaces - match.availablePlaces - held;
        const players = match._count.participations;
        if (
          (players > 0 || occupied > 0 || activeWaitlistCount > 0) &&
          changed.some(
            (key) => key !== 'description' && key !== 'totalPlaces',
          )
        ) {
          throw new ConflictException({
            code: 'MATCH_FIELDS_RESTRICTED',
            message:
              'Hay jugadores confirmados o lugares ocupados. Sólo puede modificar descripción y capacidad.',
          });
        }
        if (changed.includes('totalPlaces')) {
          if (!this.capacityConsistent(occupied, players))
            throw new ConflictException({
              code: 'MATCH_CAPACITY_INCONSISTENT',
              message:
                'Los jugadores y lugares ocupados no coinciden. Revise las reservas antes de ajustar la capacidad.',
            });
          if (after.totalPlaces < occupied + held)
            throw new ConflictException({
              code: 'MATCH_CAPACITY_INSUFFICIENT',
              message:
                'La capacidad no puede ser menor que los lugares ocupados. Aumente la capacidad e intente nuevamente.',
            });
        }
        const startsAt = new Date(after.startsAt);
        if (startsAt <= new Date())
          throw new BadRequestException({
            code: 'MATCH_START_INVALID',
            message: 'Seleccione una fecha y hora futuras.',
          });
        const [sport, location, format] = await Promise.all([
          after.sportId === before.sportId
            ? match.sport
            : tx.sport.findFirst({
                where: { id: after.sportId, active: true },
              }),
          after.locationId === before.locationId
            ? match.location
            : tx.location.findFirst({
                where: {
                  id: after.locationId,
                  active: true,
                  type: { in: ['LOCALIDAD', 'BARRIO', 'ZONA'] },
                },
              }),
          after.sportFormatId === null
            ? null
            : after.sportFormatId === before.sportFormatId &&
                after.sportId === before.sportId
              ? match.sportFormat
              : tx.sportFormat.findFirst({
                  where: {
                    id: after.sportFormatId,
                    sportId: after.sportId,
                    active: true,
                  },
                }),
        ]);
        if (!sport)
          throw new BadRequestException({
            code: 'SPORT_INVALID',
            message: 'Seleccione un deporte disponible e intente nuevamente.',
          });
        if (!location)
          throw new BadRequestException({
            code: 'LOCATION_INVALID',
            message:
              'Seleccione una localidad disponible e intente nuevamente.',
          });
        if (
          after.sportFormatId &&
          (!format || format.sportId !== after.sportId)
        )
          throw new BadRequestException({
            code: 'SPORT_FORMAT_INVALID',
            message:
              'Seleccione un formato disponible para el deporte elegido.',
          });
        if (changed.includes('startsAt')) {
          const [{ localDate }] = await tx.$queryRaw<
            { localDate: Date }[]
          >`SELECT (${startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"`;
          if (
            await tx.participation.findFirst({
              where: {
                userId,
                localDate,
                active: true,
                matchId: { not: id },
              },
            })
          )
            throw this.dateConflict();
          await invalidateSameDay(tx, userId, localDate);
          await tx.participation.updateMany({
            where: { matchId: id, userId, role: 'ORGANIZER', active: true },
            data: { localDate },
          });
        }
        const changes: Record<string, Prisma.InputJsonValue> = {};
        const snapshot = (value: { id: string; name: string } | null) =>
          value ? { id: value.id, name: value.name } : null;
        for (const key of changed)
          changes[key] = { before: before[key], after: after[key] };
        if (changed.includes('sportId'))
          changes.sportId = {
            before: snapshot(match.sport),
            after: snapshot(sport),
          };
        if (changed.includes('sportFormatId'))
          changes.sportFormatId = {
            before: snapshot(match.sportFormat),
            after: snapshot(format),
          };
        if (changed.includes('locationId'))
          changes.locationId = {
            before: snapshot(match.location),
            after: snapshot(location),
          };
        const data: Prisma.MatchUncheckedUpdateInput = {
          version: { increment: 1 },
          changes: { create: { actorId: userId, event: 'UPDATED', changes } },
        };
        for (const key of changed) {
          if (key === 'placeName') data.venueName = after.placeName;
          else if (key === 'startsAt') data.startsAt = startsAt;
          else if (key === 'totalPlaces') {
            data.totalPlaces = after.totalPlaces;
            data.availablePlaces =
              match.availablePlaces + after.totalPlaces - match.totalPlaces;
            changes.availablePlaces = {
              before: match.availablePlaces,
              after: Number(data.availablePlaces),
            };
            data.status =
              Number(data.availablePlaces) > 0 ? 'OPEN' : 'CLOSED';
            if (data.status !== match.status)
              changes.status = { before: match.status, after: data.status };
          } else Object.assign(data, { [key]: after[key] });
        }
        await tx.match.update({ where: { id }, data });
        await allocateOffers(tx, id);
        return { id };
      }, { maxWait: 10_000, timeout: 30_000 });
      if (hasChanged) await this.notifyMatchUpdated(userId, id);
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw this.dateConflict();
      throw error;
    }
  }

  async cancel(userId: string, id: string, dto: CancelMatchDto) {
    const result = await this.db.$transaction(async (tx) => {
      const match = await this.lockedMatch(tx, userId, id);
      // Ownership is always checked; a repeated cancellation cannot rewrite audit.
      if (match.status === 'CANCELLED') return { id };
      this.checkVersion(match.version, dto.expectedVersion);
      const cancellationTime = await databaseTime(tx);
      if (match.startsAt <= cancellationTime)
        throw new ConflictException({
          code: 'MATCH_NOT_EDITABLE',
          message: 'Sólo puede cancelar partidos futuros. Vuelva al detalle.',
        });
      const [reservations, participations] = await Promise.all([
        tx.reservation.findMany({
          where: { matchId: id, status: 'CONFIRMED' },
          select: { id: true, userId: true, places: true },
        }),
        tx.participation.findMany({
          where: { matchId: id, active: true },
          select: { userId: true, role: true, localDate: true },
        }),
      ]);
      const [{ localDate }] = await tx.$queryRaw<
        { localDate: Date }[]
      >`SELECT (${match.startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"`;
      const players = participations.filter((p) => p.role === 'PLAYER');
      const playerIds = new Set(players.map((p) => p.userId));
      const organizers = participations.filter((p) => p.role === 'ORGANIZER');
      const occupiedPlaces = reservations.reduce(
        (sum, row) => sum + row.places,
        0,
      );
      if (
        match.availablePlaces < 0 ||
        match.availablePlaces > match.totalPlaces ||
        occupiedPlaces + (await heldPlaces(tx, id)) !==
          match.totalPlaces - match.availablePlaces ||
        (match.status === 'CLOSED') !== (match.availablePlaces === 0) ||
        organizers.length !== 1 ||
        organizers[0].userId !== userId ||
        participations.some(
          (p) => p.localDate.getTime() !== localDate.getTime(),
        ) ||
        players.length !== reservations.length ||
        reservations.some(
          (row) => row.userId === userId || !playerIds.has(row.userId),
        )
      ) {
        throw new ConflictException({
          code: 'MATCH_CANCELLATION_INCONSISTENT',
          message:
            'No pudimos cancelar el partido porque sus reservas y lugares no coinciden. Recargue e intente nuevamente.',
        });
      }
      const waitlistEntries = await tx.waitlistEntry.findMany({
        where: { matchId: id, status: { in: ['WAITING', 'OFFERED'] } },
        select: { id: true },
      });
      for (const entry of waitlistEntries)
        await finishEntry(tx, entry.id, 'INVALIDATED', 'MATCH_CANCELLED');
      const cancelledAt = cancellationTime;
      const cancellationReason = dto.reason?.trim() || null;
      // The match lock serializes every writer of these relations. Releasing a
      // daily participation needs no player User lock; never acquire one here.
      for (const reservation of reservations)
        await recordCancellation(tx, reservation, 0, cancelledAt, 'MATCH', null);
      await tx.reservation.updateMany({
        where: { matchId: id, status: 'CONFIRMED' },
        data: {
          status: 'CANCELLED',
          version: { increment: 1 },
          cancelledAt,
          cancellationSource: 'MATCH',
          cancellationReason: null,
        },
      });
      await tx.participation.updateMany({
        where: { matchId: id, active: true },
        data: { active: false },
      });
      await tx.match.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt,
          cancellationReason,
          availablePlaces: match.totalPlaces,
          version: { increment: 1 },
          changes: {
            create: {
              actorId: userId,
              event: 'CANCELLED',
              changes: {
                status: { before: match.status, after: 'CANCELLED' },
                cancelledAt: {
                  before: null,
                  after: cancelledAt.toISOString(),
                },
                cancellationReason: {
                  before: null,
                  after: cancellationReason,
                },
                availablePlaces: {
                  before: match.availablePlaces,
                  after: match.totalPlaces,
                },
              },
            },
          },
        },
      });
      return { id };
    }, { maxWait: 10_000, timeout: 30_000 });
    await this.notifyMatchCancelled(userId, id);
    return result;
  }

  private async notifyMatchUpdated(userId: string, matchId: string) {
    const match = await this.db.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        version: true,
        venueName: true,
        organizerId: true,
        sport: { select: { name: true } },
        reservations: {
          where: { status: 'CONFIRMED' },
          select: { userId: true },
        },
      },
    });
    if (!match) return;
    await this.notifications.safeCreate({
      userId,
      type: 'MATCH_UPDATED',
      title: 'Actualizaste tu partido',
      body: `Modificaste ${match.sport.name} en ${match.venueName}.`,
      detail: 'La modificación quedó registrada.',
      relatedMatchId: match.id,
      actorUserId: userId,
      dedupeKey: `MATCH_UPDATED_CONFIRMATION:${match.id}:${match.version}`,
    });
    for (const reservation of match.reservations) {
      if (reservation.userId === match.organizerId || reservation.userId === userId) continue;
      await this.notifications.safeCreate({
        userId: reservation.userId,
        type: 'MATCH_UPDATED',
        title: 'Se modificó tu partido',
        body: `El organizador modificó ${match.sport.name} en ${match.venueName}.`,
        detail: 'Revisá la información actualizada antes de participar.',
        relatedMatchId: match.id,
        actorUserId: userId,
        dedupeKey: `MATCH_UPDATED_PARTICIPANT:${match.id}:${reservation.userId}:${match.version}`,
      });
    }
  }

  private async notifyMatchCancelled(userId: string, matchId: string) {
    const match = await this.db.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        venueName: true,
        sport: { select: { name: true } },
      },
    });
    if (!match) return;
    await this.notifications.safeCreate({
      userId,
      type: 'MATCH_CANCELLED',
      title: 'Cancelaste tu partido',
      body: `Cancelaste ${match.sport.name} en ${match.venueName}.`,
      detail: 'La cancelación quedó registrada.',
      relatedMatchId: match.id,
      actorUserId: userId,
      dedupeKey: `MATCH_CANCELLED_CONFIRMATION:${match.id}`,
    });
    const reservations = await this.db.reservation.findMany({
      where: { matchId: match.id, status: 'CANCELLED', cancellationSource: 'MATCH' },
      select: { userId: true, id: true },
    });
    for (const reservation of reservations) {
      if (reservation.userId === userId) continue;
      await this.notifications.safeCreate({
        userId: reservation.userId,
        type: 'MATCH_CANCELLED',
        title: 'Se canceló tu partido',
        body: `El organizador canceló ${match.sport.name} en ${match.venueName}.`,
        detail: 'La cancelación quedó registrada.',
        relatedMatchId: match.id,
        actorUserId: userId,
        dedupeKey: `MATCH_CANCELLED_PARTICIPANT:${match.id}:${reservation.id}`,
      });
    }
  }

  async history(userId: string, id: string, page: number) {
    await this.ownMatch(userId, id);
    const [items, total] = await this.db.$transaction(
      [
        this.db.matchChange.findMany({
          where: { matchId: id },
          select: {
            id: true,
            event: true,
            occurredAt: true,
            actor: { select: { id: true, name: true } },
            changes: true,
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 3,
          skip: (page - 1) * 3,
        }),
        this.db.matchChange.count({ where: { matchId: id } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 3, hasMore: page * 3 < total };
  }
}

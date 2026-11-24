import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const where: Prisma.MatchWhereInput = {
      organizerId: userId,
      ...(query.filter === 'cancelled'
        ? { status: 'CANCELLED' }
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
      items,
      total,
      page: query.page,
      pageSize: 9,
      hasMore: query.page * 9 < total,
    };
  }

  async create(userId: string, dto: CreateMatchDto) {
    try {
      return await this.db.$transaction(async (tx) => {
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
        return match;
      });
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
        createdAt: true,
        updatedAt: true,
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
    const {
      organizerId: _organizerId,
      venueName,
      _count,
      sportId: _sportId,
      sportFormatId: _sportFormatId,
      locationId: _locationId,
      ...match
    } = await this.ownMatch(userId, id, tx);
    const occupiedPlaces = match.totalPlaces - match.availablePlaces;
    const activePlayerCount = _count.participations;
    const hasConfirmedParticipants =
      activePlayerCount > 0 || occupiedPlaces > 0;
    const canEdit = match.status !== 'CANCELLED' && match.startsAt > new Date();
    return {
      ...match,
      placeName: venueName,
      pricePerPerson: match.pricePerPerson.toString(),
      occupiedPlaces,
      activePlayerCount,
      hasConfirmedParticipants,
      canEdit,
      canCancel: canEdit && !hasConfirmedParticipants,
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
        if (dto.placeName !== undefined) after.placeName = dto.placeName.trim();
        if (dto.address !== undefined) after.address = dto.address.trim();
        if (dto.pricePerPerson !== undefined)
          after.pricePerPerson = new Prisma.Decimal(
            dto.pricePerPerson,
          ).toString();
        if (dto.totalPlaces !== undefined) after.totalPlaces = dto.totalPlaces;
        if (dto.description !== undefined)
          after.description = dto.description?.trim() || null;
        const changed = (Object.keys(before) as (keyof typeof before)[]).filter(
          (key) => before[key] !== after[key],
        );
        if (!changed.length) return { id };
        hasChanged = true;
        const occupied = match.totalPlaces - match.availablePlaces;
        const players = match._count.participations;
        if (
          (players > 0 || occupied > 0) &&
          changed.some((key) => key !== 'description' && key !== 'totalPlaces')
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
          if (after.totalPlaces < occupied)
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
              where: { userId, localDate, active: true, matchId: { not: id } },
            })
          )
            throw this.dateConflict();
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
            data.status = Number(data.availablePlaces) > 0 ? 'OPEN' : 'CLOSED';
            if (data.status !== match.status)
              changes.status = { before: match.status, after: data.status };
          } else Object.assign(data, { [key]: after[key] });
        }
        await tx.match.update({ where: { id }, data });
        return { id };
      });
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
      this.checkFuture(match);
      if (
        match._count.participations > 0 ||
        match.totalPlaces - match.availablePlaces > 0
      )
        throw new ConflictException({
          code: 'MATCH_CANCELLATION_REQUIRES_RESERVATIONS_INTEGRATION',
          message:
            'Este partido tiene jugadores o lugares ocupados. La cancelación requiere la gestión de reservas.',
        });
      const cancelledAt = new Date();
      const cancellationReason = dto.reason?.trim() || null;
      await tx.participation.updateMany({
        where: { userId, matchId: id, role: 'ORGANIZER', active: true },
        data: { active: false },
      });
      await tx.match.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt,
          cancellationReason,
          version: { increment: 1 },
          changes: {
            create: {
              actorId: userId,
              event: 'CANCELLED',
              changes: {
                status: { before: match.status, after: 'CANCELLED' },
                cancelledAt: { before: null, after: cancelledAt.toISOString() },
                cancellationReason: { before: null, after: cancellationReason },
              },
            },
          },
        },
      });
      return { id };
    });
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
        reservations: { select: { userId: true } },
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

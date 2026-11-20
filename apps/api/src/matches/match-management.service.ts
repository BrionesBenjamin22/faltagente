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
import type { MyMatchesQueryDto } from './dto/my-matches.dto.js';

@Injectable()
export class MatchManagementService {
  constructor(private readonly db: PrismaService) {}

  async ownList(userId: string, query: MyMatchesQueryDto) {
    const now = new Date();
    const where: Prisma.MatchWhereInput = {
      organizerId: userId,
      ...(query.filter === 'cancelled'
        ? { status: 'CANCELLED' }
        : { status: { in: ['OPEN', 'CLOSED'] }, startsAt: query.filter === 'past' ? { lte: now } : { gt: now } }),
    };
    const direction = query.filter === 'upcoming' ? 'asc' : 'desc';
    const [items, total] = await this.db.$transaction([
      this.db.match.findMany({
        where,
        select: {
          id: true, startsAt: true, venueName: true, address: true,
          pricePerPerson: true, availablePlaces: true, status: true, description: true,
          location: { select: { id: true, name: true, type: true } },
          sport: { select: { id: true, name: true, slug: true } },
          sportFormat: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ startsAt: direction }, { id: direction }],
        take: 9, skip: (query.page - 1) * 9,
      }),
      this.db.match.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items, total, page: query.page, pageSize: 9, hasMore: query.page * 9 < total };
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

  private async ownMatch(userId: string, id: string) {
    const match = await this.db.match.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        totalPlaces: true,
        availablePlaces: true,
        version: true,
        createdAt: true,
        updatedAt: true,
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
    const { organizerId: _organizerId, ...match } = await this.ownMatch(
      userId,
      id,
    );
    return match;
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

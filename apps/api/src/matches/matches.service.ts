import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module.js';
import { MatchDetailResponse } from './dto/match-detail-response.dto.js';
import { MatchesQueryDto } from './dto/matches-query.dto.js';

// Shared public match fields; each endpoint selects its own relation projection.
const publicMatchFields = {
  id: true,
  sport: { select: { id: true, name: true, slug: true } },
  sportFormat: { select: { id: true, name: true, slug: true } },
  startsAt: true,
  venueName: true,
  address: true,
  pricePerPerson: true,
  availablePlaces: true,
  status: true,
  description: true,
} satisfies Prisma.MatchSelect;

@Injectable()
export class MatchesService {
  constructor(private readonly db: PrismaService) {}
  async detail(id: string): Promise<MatchDetailResponse> {
    const match = await this.db.match.findUnique({
      where: { id },
      select: {
        ...publicMatchFields,
        totalPlaces: true,
        location: { select: { id: true, name: true } },
        organizer: { select: { id: true, name: true } },
      },
    });
    if (!match) throw new NotFoundException();
    const { venueName, ...fields } = match;
    return {
      ...fields,
      placeName: venueName,
      startsAt: match.startsAt.toISOString(),
      pricePerPerson: match.pricePerPerson.toString(),
    };
  }
  async list(query: MatchesQueryDto) {
    if (query.sportFormatId) {
      if (!query.sportId) {
        throw new BadRequestException({
          code: 'INVALID_SPORT_FORMAT_FILTER',
          message: 'Seleccioná un deporte para filtrar por formato.',
        });
      }
      const format = await this.db.sportFormat.findFirst({
        where: { id: query.sportFormatId, sportId: query.sportId },
        select: { id: true },
      });
      if (!format) {
        throw new BadRequestException({
          code: 'INVALID_SPORT_FORMAT_FILTER',
          message: 'El formato seleccionado no pertenece al deporte.',
        });
      }
    }
    const startsAt: Prisma.DateTimeFilter = { gt: new Date() };
    if (query.date) {
      // PostgreSQL resolves each local midnight using the named zone, independently
      // of the API host timezone and without assuming a permanent UTC offset.
      const [bounds] = await this.db.$queryRaw<{ start: Date; end: Date }[]>`
        SELECT (${query.date}::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS start,
               ((${query.date}::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS end
      `;
      startsAt.gte = bounds.start;
      startsAt.lt = bounds.end;
    }
    const where: Prisma.MatchWhereInput = {
      locationId: query.locationId,
      ...(query.sportId ? { sportId: query.sportId } : {}),
      ...(query.sportFormatId ? { sportFormatId: query.sportFormatId } : {}),
      status: { in: ['OPEN', 'CLOSED'] },
      startsAt,
      location: { active: true },
    };
    const [items, total] = await this.db.$transaction(
      async tx => {
        const select = {
          ...publicMatchFields,
          location: { select: { id: true, name: true, type: true } },
        } satisfies Prisma.MatchSelect;
        const orderBy = [{ startsAt: 'asc' }, { id: 'asc' }] satisfies Prisma.MatchOrderByWithRelationInput[];
        const skip = (query.page - 1) * 9;
        const total = await tx.match.count({ where });
        if (query.locationId || !query.preferredLocationId) {
          return [await tx.match.findMany({ where, select, orderBy, take: 9, skip }), total] as const;
        }

        // Paginate the two ordered groups in the same snapshot. Never load or
        // sort the complete discovery list in memory to prioritize a locality.
        const preferredWhere = { ...where, locationId: query.preferredLocationId };
        const preferredCount = await tx.match.count({ where: preferredWhere });
        const preferred = skip < preferredCount
          ? await tx.match.findMany({ where: preferredWhere, select, orderBy, take: 9, skip })
          : [];
        const remaining = 9 - preferred.length;
        const others = remaining > 0
          ? await tx.match.findMany({
            where: { ...where, locationId: { not: query.preferredLocationId } },
            select,
            orderBy,
            take: remaining,
            skip: Math.max(0, skip - preferredCount),
          })
          : [];
        return [[...preferred, ...others], total] as const;
      },
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
}

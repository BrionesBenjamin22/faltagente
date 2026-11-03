import { BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, Query } from '@nestjs/common';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module.js';
import { MatchesResponse } from '../common/http/response.dto.js';
import { MatchDetailResponse } from './match-detail-response.dto.js';

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

export class MatchIdDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
}
export class MatchesQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() locationId: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() sportId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Requires sportId and must belong to that sport.' })
  @IsOptional() @IsUUID() sportFormatId?: string;
  @ApiPropertyOptional({ format: 'date', example: '2026-11-03', description: 'Calendar day in America/Argentina/Buenos_Aires.' })
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}
@Injectable()
export class MatchesService {
  constructor(private readonly db: PrismaService) {}
  async detail(id: string): Promise<MatchDetailResponse> {
    const match = await this.db.match.findUnique({
      where: { id },
      select: {
        ...publicMatchFields,
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
        throw new BadRequestException({ code: 'INVALID_SPORT_FORMAT_FILTER', message: 'Seleccioná un deporte para filtrar por formato.' });
      }
      const format = await this.db.sportFormat.findFirst({
        where: { id: query.sportFormatId, sportId: query.sportId },
        select: { id: true },
      });
      if (!format) {
        throw new BadRequestException({ code: 'INVALID_SPORT_FORMAT_FILTER', message: 'El formato seleccionado no pertenece al deporte.' });
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
      [
        this.db.match.findMany({
          where,
          select: {
            ...publicMatchFields,
            location: { select: { id: true, name: true, type: true } },
          },
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
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
}
@ApiTags('Matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly service: MatchesService) {}
  @ApiOkResponse({ type: MatchDetailResponse })
  @ApiNotFoundResponse({ description: 'Partido inexistente.' })
  @ApiBadRequestResponse({ description: 'Identificador UUID inválido.' })
  @Get(':id')
  detail(@Param() params: MatchIdDto) {
    return this.service.detail(params.id);
  }
  @ApiOkResponse({ type: MatchesResponse }) @Get() list(
    @Query() query: MatchesQueryDto,
  ) {
    return this.service.list(query);
  }
}
@Module({ controllers: [MatchesController], providers: [MatchesService] })
export class MatchesModule {}

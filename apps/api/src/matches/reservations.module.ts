import {
  BadRequestException,
  ForbiddenException,
  Patch,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { confirmReservation, reservationProjection } from './booking-core.js';

import { recordCancellation } from './reservation-cancellations.domain.js';
import {
  databaseTime,
  lockBookingDomain,
  settleMatch,
  allocateOffers,
  heldPlaces,
} from '../waitlist/waitlist.domain.js';
import { MatchIdDto } from './dto/match-id.dto.js';
import { MAX_RESERVATION_PLACES } from './reservation-limits.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export class CreateReservationDto {
  @ApiProperty({ minimum: 1, maximum: MAX_RESERVATION_PLACES, example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_RESERVATION_PLACES)
  places: number;
}
export class CancelReservationDto {}
export class OrganizerCancelReservationDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion: number;
  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(0, 500)
  reason?: string;
}
export class ReduceReservationPlacesDto extends OrganizerCancelReservationDto {
  @ApiProperty({ minimum: 1, maximum: MAX_RESERVATION_PLACES })
  @IsInt()
  @Min(1)
  @Max(MAX_RESERVATION_PLACES)
  places: number;
}
export class ReservationIdDto extends MatchIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reservationId: string;
}
export class ReservationHistoryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}
export class ReservationResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) matchId: string;
  @ApiProperty({ minimum: 1 }) places: number;
  @ApiProperty() originalPlaces: number;
  @ApiProperty() version: number;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}
export class ReservationHistoryItemResponse extends ReservationResponse {
  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancellationReason:
    string | null;
  @ApiProperty({ enum: ['USER', 'MATCH', 'ORGANIZER'], nullable: true })
  cancellationSource: string | null;
}
export class ReservationMatchCancellationResponse {
  @ApiProperty({ format: 'date-time' }) cancelledAt: Date;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class ReservationHistoryResponse {
  @ApiProperty({ type: [ReservationHistoryItemResponse] })
  items: ReservationHistoryItemResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 3 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
  @ApiProperty({ type: ReservationMatchCancellationResponse, nullable: true })
  matchCancellation: ReservationMatchCancellationResponse | null;
}
export class ReservationHolderResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}
export class OrganizerReservationResponse extends ReservationResponse {
  @ApiProperty({ type: ReservationHolderResponse })
  holder: ReservationHolderResponse;
}
export class OrganizerReservationsResponse {
  @ApiProperty({ type: [OrganizerReservationResponse] })
  items: OrganizerReservationResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 9 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
export class ReservationCancellationResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() previousPlaces: number;
  @ApiProperty() remainingPlaces: number;
  @ApiProperty({ format: 'date-time' }) occurredAt: Date;
  @ApiProperty({ enum: ['USER', 'MATCH', 'ORGANIZER'] }) source: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class ReservationCancellationsResponse {
  @ApiProperty({ type: [ReservationCancellationResponse] })
  items: ReservationCancellationResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 3 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
const projection = reservationProjection;
const historyProjection = {
  ...projection,
  status: true,
  cancelledAt: true,
  cancellationReason: true,
  cancellationSource: true,
} as const;
const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });

@Injectable()
export class ReservationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
  async mine(userId: string, matchId: string) {
    if (
      !(await this.db.match.findUnique({
        where: { id: matchId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    return this.db.reservation.findFirst({
      where: { userId, matchId, status: 'CONFIRMED' },
      select: projection,
    });
  }
  async history(userId: string, matchId: string, page: number) {
    return this.db.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { id: matchId },
          select: { cancelledAt: true, cancellationReason: true },
        });
        if (!match) throw new NotFoundException();
        const where = { userId, matchId };
        const [items, total, affected] = await Promise.all([
          tx.reservation.findMany({
            where,
            select: historyProjection,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 3,
            skip: (page - 1) * 3,
          }),
          tx.reservation.count({ where }),
          tx.reservation.findFirst({
            where: { ...where, cancellationSource: 'MATCH' },
            select: { id: true },
          }),
        ]);
        return {
          items,
          total,
          page,
          pageSize: 3,
          hasMore: page * 3 < total,
          matchCancellation:
            affected && match.cancelledAt
              ? {
                  cancelledAt: match.cancelledAt,
                  reason: match.cancellationReason,
                }
              : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async create(userId: string, matchId: string, places: number) {
    const outcome = await this.db.$transaction(
      async (tx) => {
        await lockBookingDomain(tx);
        await settleMatch(tx, matchId);
        const existing = await tx.reservation.findFirst({
          where: { userId, matchId, status: 'CONFIRMED' },
          select: projection,
        });
        const match = await tx.match.findUnique({
          where: { id: matchId },
          select: {
            organizerId: true,
            availablePlaces: true,
            totalPlaces: true,
          },
        });
        const reservation = await confirmReservation(
          tx,
          userId,
          matchId,
          places,
        );
        return {
          reservation,
          notify: !existing,
          completed: !existing && match?.availablePlaces === places,
          organizerId: match?.organizerId ?? null,
        };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    if (outcome.notify && outcome.organizerId) {
      const [player, match] = await Promise.all([
        this.db.user.findUnique({
          where: { id: userId },
          select: { name: true },
        }),
        this.db.match.findUnique({
          where: { id: matchId },
          select: {
            venueName: true,
            totalPlaces: true,
            availablePlaces: true,
            sport: { select: { name: true } },
          },
        }),
      ]);
      await this.notifications.safeCreate({
        userId: outcome.organizerId,
        type: 'MATCH_JOINED',
        title: 'Alguien se sumó a tu partido',
        body: `${player?.name ?? 'Un jugador'} reservó ${places} ${places === 1 ? 'lugar' : 'lugares'}.`,
        detail: match
          ? `${match.availablePlaces} de ${match.totalPlaces} lugares disponibles.`
          : undefined,
        relatedMatchId: matchId,
        actorUserId: userId,
        dedupeKey: `MATCH_JOINED:${matchId}:${outcome.reservation.id}`,
        metadata: { places, remainingPlaces: match?.availablePlaces ?? null },
      });
      await this.notifications.safeCreate({
        userId,
        type: 'RESERVATION_CONFIRMED',
        title: 'Te sumaste al partido',
        body: match
          ? `Reservaste ${places} ${places === 1 ? 'lugar' : 'lugares'} en ${match.venueName}.`
          : 'Tu reserva quedó confirmada.',
        detail: match
          ? `${match.sport.name}. ${match.availablePlaces} lugares disponibles.`
          : undefined,
        relatedMatchId: matchId,
        dedupeKey: `RESERVATION_CONFIRMED:${matchId}:${outcome.reservation.id}`,
        metadata: { places, remainingPlaces: match?.availablePlaces ?? null },
      });
      if (outcome.completed) {
        await this.notifications.safeCreate({
          userId: outcome.organizerId,
          type: 'MATCH_COMPLETED',
          title: 'Tu partido se completó',
          body: match
            ? `Se completaron los cupos de ${match.sport.name} en ${match.venueName}.`
            : 'Se completaron los cupos de tu partido.',
          relatedMatchId: matchId,
          dedupeKey: `MATCH_COMPLETED:${matchId}`,
          metadata: { totalPlaces: match?.totalPlaces ?? null },
        });
      }
    }
    return outcome.reservation;
  }
  async organizerList(userId: string, matchId: string, page: number) {
    return this.db.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { id: matchId },
          select: { organizerId: true },
        });
        if (!match) throw new NotFoundException();
        if (match.organizerId !== userId)
          throw new ForbiddenException({
            code: 'RESERVATIONS_FORBIDDEN',
            message: 'Sólo el organizador puede consultar las reservas.',
          });
        const where = { matchId, status: 'CONFIRMED' as const };
        const [items, total] = await Promise.all([
          tx.reservation.findMany({
            where,
            select: {
              ...projection,
              user: { select: { id: true, name: true } },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 9,
            skip: (page - 1) * 9,
          }),
          tx.reservation.count({ where }),
        ]);
        return {
          items: items.map(({ user, ...item }) => ({ ...item, holder: user })),
          total,
          page,
          pageSize: 9,
          hasMore: page * 9 < total,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async cancellations(
    userId: string,
    matchId: string,
    reservationId: string,
    page: number,
  ) {
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.reservation.findFirst({
            where: { id: reservationId, matchId, userId },
            select: { id: true },
          }))
        )
          throw new NotFoundException();
        const where = { reservationId };
        const [items, total] = await Promise.all([
          tx.reservationCancellation.findMany({
            where,
            select: {
              id: true,
              previousPlaces: true,
              remainingPlaces: true,
              occurredAt: true,
              source: true,
              reason: true,
            },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            take: 3,
            skip: (page - 1) * 3,
          }),
          tx.reservationCancellation.count({ where }),
        ]);
        return { items, total, page, pageSize: 3, hasMore: page * 3 < total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async reducePlaces(
    userId: string,
    matchId: string,
    reservationId: string,
    dto: ReduceReservationPlacesDto,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await lockBookingDomain(tx);
        await settleMatch(tx, matchId);
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
        const match = await tx.match.findUnique({ where: { id: matchId } });
        const reservation = await tx.reservation.findFirst({
          where: { id: reservationId, matchId },
          select: { ...historyProjection, userId: true },
        });
        if (
          !match ||
          !reservation ||
          (reservation.userId !== userId && match.organizerId !== userId)
        )
          throw new NotFoundException();
        const organizer = match.organizerId === userId;
        if (!organizer && dto.reason !== undefined)
          throw new BadRequestException({
            code: 'RESERVATION_REASON_FORBIDDEN',
            message: 'Sólo el organizador puede indicar un motivo.',
          });
        if (reservation.version !== dto.expectedVersion)
          throw conflict(
            'RESERVATION_VERSION_CONFLICT',
            'La reserva cambió. Recargue y revise la cantidad antes de continuar.',
          );
        const now = await databaseTime(tx);
        if (
          reservation.status !== 'CONFIRMED' ||
          match.status === 'CANCELLED' ||
          match.startsAt <= now
        )
          throw conflict(
            'RESERVATION_NOT_EDITABLE',
            'Sólo puede reducir reservas vigentes antes del inicio. Vuelva al detalle.',
          );
        if (dto.places > reservation.places)
          throw conflict(
            'RESERVATION_INCREASE_FORBIDDEN',
            'No puede ampliar la reserva. Seleccione una cantidad menor.',
          );
        if (dto.places === reservation.places) {
          const { userId: _holder, ...response } = reservation;
          return response;
        }
        const reservations = await tx.reservation.findMany({
          where: { matchId, status: 'CONFIRMED' },
          select: { userId: true, places: true },
        });
        const players = await tx.participation.findMany({
          where: { matchId, role: 'PLAYER', active: true },
          select: { userId: true, localDate: true },
        });
        const [{ localDate }] = await tx.$queryRaw<
          { localDate: Date }[]
        >`SELECT (${match.startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"`;
        const occupied = reservations.reduce((sum, row) => sum + row.places, 0);
        if (
          match.availablePlaces < 0 ||
          match.availablePlaces > match.totalPlaces ||
          occupied + (await heldPlaces(tx, matchId)) !==
            match.totalPlaces - match.availablePlaces ||
          players.length !== reservations.length ||
          reservations.some(
            (row) =>
              !players.some(
                (player) =>
                  player.userId === row.userId &&
                  player.localDate.getTime() === localDate.getTime(),
              ),
          ) ||
          (match.status === 'CLOSED') !== (match.availablePlaces === 0)
        )
          throw conflict(
            'RESERVATION_INCONSISTENT',
            'No pudimos liberar los lugares. Recargue el partido e intente nuevamente.',
          );
        await recordCancellation(
          tx,
          reservation,
          dto.places,
          now,
          organizer ? 'ORGANIZER' : 'USER',
          organizer ? dto.reason?.trim() || null : null,
        );
        await tx.match.update({
          where: { id: matchId },
          data: {
            availablePlaces: { increment: reservation.places - dto.places },
            status: 'OPEN',
            version: { increment: 1 },
          },
        });
        const response = await tx.reservation.update({
          where: { id: reservationId },
          data: { places: dto.places, version: { increment: 1 } },
          select: historyProjection,
        });
        await allocateOffers(tx, matchId);
        return response;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }
  async cancel(
    userId: string,
    matchId: string,
    reservationId: string,
    organizerCancellation?: OrganizerCancelReservationDto,
  ) {
    const outcome = await this.db.$transaction(
      async (tx) => {
        await lockBookingDomain(tx);
        await settleMatch(tx, matchId);
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
        const reservation = await tx.reservation.findFirst({
          where: {
            id: reservationId,
            matchId,
            ...(!organizerCancellation ? { userId } : {}),
          },
          select: historyProjection,
        });
        // A single not-found response does not reveal another user's reservation.
        if (!reservation) throw new NotFoundException();
        const match = await tx.match.findUniqueOrThrow({
          where: { id: matchId },
        });
        if (organizerCancellation && match.organizerId !== userId)
          throw new NotFoundException();
        if (reservation.status === 'CANCELLED')
          return { reservation, cancelled: false as const };
        if (
          organizerCancellation &&
          organizerCancellation.expectedVersion !== reservation.version
        )
          throw conflict(
            'RESERVATION_VERSION_CONFLICT',
            'La reserva cambió. Recargue y revise la reserva antes de continuar.',
          );
        const holder = await tx.reservation.findUniqueOrThrow({
          where: { id: reservationId },
          select: { userId: true },
        });
        const source = organizerCancellation
          ? ('ORGANIZER' as const)
          : ('USER' as const);
        const reason = organizerCancellation?.reason?.trim() || null;
        const cancelledAt = await databaseTime(tx);
        if (match.status === 'CANCELLED' || match.startsAt <= cancelledAt)
          throw conflict(
            'RESERVATION_NOT_CANCELLABLE',
            'La reserva sólo puede cancelarse antes del inicio de un partido vigente. Vuelva al detalle.',
          );
        const [reservations, players] = await Promise.all([
          tx.reservation.findMany({
            where: { matchId, status: 'CONFIRMED' },
            select: {
              userId: true,
              places: true,
            },
          }),
          tx.participation.findMany({
            where: { matchId, role: 'PLAYER', active: true },
            select: { userId: true, localDate: true },
          }),
        ]);
        const occupied = reservations.reduce((sum, row) => sum + row.places, 0);
        const [{ localDate }] = await tx.$queryRaw<
          { localDate: Date }[]
        >`SELECT (${match.startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"`;
        if (
          match.availablePlaces < 0 ||
          match.availablePlaces > match.totalPlaces ||
          occupied + (await heldPlaces(tx, matchId)) !==
            match.totalPlaces - match.availablePlaces ||
          players.length !== reservations.length ||
          reservations.some(
            (row) =>
              !players.some(
                (p) =>
                  p.userId === row.userId &&
                  p.localDate.getTime() === localDate.getTime(),
              ),
          ) ||
          (match.status === 'CLOSED') !== (match.availablePlaces === 0)
        ) {
          throw conflict(
            'RESERVATION_INCONSISTENT',
            'No pudimos cancelar la reserva. Recargue el partido e intente nuevamente.',
          );
        }
        await recordCancellation(
          tx,
          reservation,
          0,
          cancelledAt,
          source,
          reason,
        );
        await tx.participation.update({
          where: { userId_matchId: { userId: holder.userId, matchId } },
          data: { active: false },
        });
        await tx.match.update({
          where: { id: matchId },
          data: {
            availablePlaces: { increment: reservation.places },
            status: 'OPEN',
            version: { increment: 1 },
          },
        });
        const result = await tx.reservation.update({
          where: { id: reservationId },
          data: {
            status: 'CANCELLED',
            version: { increment: 1 },
            cancelledAt,
            cancellationReason: reason,
            cancellationSource: source,
          },
          select: historyProjection,
        });
        await allocateOffers(tx, matchId);
        return {
          reservation: result,
          cancelled: true as const,
          holderUserId: holder.userId,
        };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    if (outcome.cancelled) {
      const [player, match] = await Promise.all([
        this.db.user.findUnique({
          where: { id: outcome.holderUserId },
          select: { name: true },
        }),
        this.db.match.findUnique({
          where: { id: matchId },
          select: {
            organizerId: true,
            venueName: true,
            sport: { select: { name: true } },
          },
        }),
      ]);
      if (match) {
        if (organizerCancellation) {
          await this.notifications.safeCreate({
            userId: outcome.holderUserId,
            type: 'PLAYER_REMOVED',
            title: 'Se dio de baja tu reserva',
            body: `El organizador dio de baja tu reserva en ${match.sport.name}.`,
            detail: outcome.reservation.cancellationReason ?? match.venueName,
            relatedMatchId: matchId,
            actorUserId: userId,
            dedupeKey: `PLAYER_REMOVED:${matchId}:${reservationId}`,
            metadata: { places: outcome.reservation.places },
          });
          await this.notifications.safeCreate({
            userId,
            type: 'PLAYER_REMOVED',
            title: 'Diste de baja una reserva',
            body: `Diste de baja la reserva de ${player?.name ?? 'un jugador'} en ${match.sport.name}.`,
            detail: match.venueName,
            relatedMatchId: matchId,
            actorUserId: userId,
            dedupeKey: `PLAYER_REMOVED_CONFIRMATION:${matchId}:${reservationId}`,
            metadata: { places: outcome.reservation.places },
          });
        } else {
          await this.notifications.safeCreate({
            userId: match.organizerId,
            type: 'MATCH_LEFT',
            title: 'Alguien se bajó de tu partido',
            body: `${player?.name ?? 'Un jugador'} canceló su reserva.`,
            detail: `${match.sport.name} en ${match.venueName}.`,
            relatedMatchId: matchId,
            actorUserId: userId,
            dedupeKey: `MATCH_LEFT:${matchId}:${reservationId}`,
            metadata: { places: outcome.reservation.places },
          });
          await this.notifications.safeCreate({
            userId,
            type: 'MATCH_LEFT',
            title: 'Cancelaste tu reserva',
            body: `Liberaste ${outcome.reservation.places} ${outcome.reservation.places === 1 ? 'lugar' : 'lugares'} en ${match.sport.name}.`,
            detail: match.venueName,
            relatedMatchId: matchId,
            dedupeKey: `MATCH_LEFT_CONFIRMATION:${matchId}:${reservationId}`,
            metadata: { places: outcome.reservation.places },
          });
        }
      }
    }
    return outcome.reservation;
  }
}
@ApiExtraModels(ReservationResponse)
@ApiTags('Reservations')
@Controller('matches/:id/reservations')
export class ReservationsController {
  constructor(
    private readonly service: ReservationsService,
    private readonly auth: AuthService,
  ) {}
  @ApiOkResponse({
    schema: {
      allOf: [{ $ref: getSchemaPath(ReservationResponse) }],
      nullable: true,
    },
    description: 'Reserva propia confirmada o null.',
  })
  @Get('me')
  async mine(
    @Param() params: MatchIdDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return res.json(
      await this.service.mine(await this.auth.requireUser(req), params.id),
    );
  }
  @ApiOkResponse({ type: ReservationHistoryResponse })
  @Get('history')
  async history(
    @Param() params: MatchIdDto,
    @Query() query: ReservationHistoryQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.history(
      await this.auth.requireUser(req),
      params.id,
      query.page,
    );
  }
  @ApiOkResponse({
    type: OrganizerReservationsResponse,
    description:
      'Reservas confirmadas agrupadas por titular, nueve por página.',
  })
  @Get()
  async organizerList(
    @Param() params: MatchIdDto,
    @Query() query: ReservationHistoryQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.organizerList(
      await this.auth.requireUser(req),
      params.id,
      query.page,
    );
  }
  @ApiOkResponse({
    type: ReservationCancellationsResponse,
    description: 'Movimientos privados, tres por página.',
  })
  @Get(':reservationId/cancellations')
  async cancellations(
    @Param() params: ReservationIdDto,
    @Query() query: ReservationHistoryQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.cancellations(
      await this.auth.requireUser(req),
      params.id,
      params.reservationId,
      query.page,
    );
  }
  @ApiOkResponse({ type: ReservationHistoryItemResponse })
  @Patch(':reservationId/places')
  async reducePlaces(
    @Param() params: ReservationIdDto,
    @Body() dto: ReduceReservationPlacesDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.reducePlaces(
      await this.auth.requireUser(req),
      params.id,
      params.reservationId,
      dto,
    );
  }
  @ApiCreatedResponse({ type: ReservationResponse })
  @Post()
  async create(
    @Param() params: MatchIdDto,
    @Body() dto: CreateReservationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.create(
      await this.auth.requireUser(req),
      params.id,
      dto.places,
    );
  }
  @ApiOkResponse({ type: ReservationHistoryItemResponse })
  @HttpCode(200)
  @Post(':reservationId/cancel')
  async cancel(
    @Param() params: ReservationIdDto,
    @Body() _dto: CancelReservationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.cancel(
      await this.auth.requireUser(req),
      params.id,
      params.reservationId,
    );
  }
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' } },
      required: ['id'],
    },
  })
  @HttpCode(200)
  @Post(':reservationId/cancel-by-organizer')
  async cancelByOrganizer(
    @Param() params: ReservationIdDto,
    @Body() dto: OrganizerCancelReservationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    await this.service.cancel(
      await this.auth.requireUser(req),
      params.id,
      params.reservationId,
      dto,
    );
    return { id: params.reservationId };
  }
}
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}

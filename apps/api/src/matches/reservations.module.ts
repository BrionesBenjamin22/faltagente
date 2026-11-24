import {
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
import { MatchIdDto } from './dto/match-id.dto.js';

export class CreateReservationDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647, example: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  places: number;
}
export class CancelReservationDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(0, 500)
  reason?: string;
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
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}
export class ReservationHistoryItemResponse extends ReservationResponse {
  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancellationReason:
    string | null;
}
export class ReservationHistoryResponse {
  @ApiProperty({ type: [ReservationHistoryItemResponse] })
  items: ReservationHistoryItemResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 3 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
const projection = {
  id: true,
  matchId: true,
  places: true,
  createdAt: true,
} as const;
const historyProjection = {
  ...projection,
  status: true,
  cancelledAt: true,
  cancellationReason: true,
} as const;
const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });

@Injectable()
export class ReservationsService {
  constructor(private readonly db: PrismaService) {}
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
    if (
      !(await this.db.match.findUnique({
        where: { id: matchId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    const where = { userId, matchId };
    const [items, total] = await this.db.$transaction(
      [
        this.db.reservation.findMany({
          where,
          select: historyProjection,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 3,
          skip: (page - 1) * 3,
        }),
        this.db.reservation.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, pageSize: 3, hasMore: page * 3 < total };
  }
  async create(userId: string, matchId: string, places: number) {
    return this.db.$transaction(
      async (tx) => {
        // All participation writers lock user before match, including cancellation.
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
        if (!match) throw new NotFoundException();
        if (match.organizerId === userId)
          throw conflict('OWN_MATCH', 'No podés reservar tu propio partido.');
        if (match.status !== 'OPEN' || match.startsAt <= new Date())
          throw conflict(
            'MATCH_UNAVAILABLE',
            'El partido no está disponible para inscripciones.',
          );
        if (match.availablePlaces < places)
          throw conflict(
            'MATCH_FULL',
            'No quedan suficientes lugares disponibles.',
          );
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
            startsAt: { gt: new Date() },
            availablePlaces: { gte: places },
          },
          data: {
            availablePlaces: { decrement: places },
            version: { increment: 1 },
          },
        });
        if (!changed.count)
          throw conflict(
            'MATCH_UNAVAILABLE',
            'El partido ya no está disponible.',
          );
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
        return tx.reservation.create({
          data: { userId, matchId, places },
          select: projection,
        });
      },
      { maxWait: 10_000 },
    );
  }
  async cancel(
    userId: string,
    matchId: string,
    reservationId: string,
    reason?: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
        const reservation = await tx.reservation.findFirst({
          where: { id: reservationId, matchId, userId },
          select: historyProjection,
        });
        // A single not-found response does not reveal another user's reservation.
        if (!reservation) throw new NotFoundException();
        if (reservation.status === 'CANCELLED') return reservation;
        const match = await tx.match.findUniqueOrThrow({
          where: { id: matchId },
        });
        const cancelledAt = new Date();
        if (match.status === 'CANCELLED' || match.startsAt <= cancelledAt)
          throw conflict(
            'RESERVATION_NOT_CANCELLABLE',
            'La reserva sólo puede cancelarse antes del inicio de un partido vigente. Vuelva al detalle.',
          );
        const [reservations, players] = await Promise.all([
          tx.reservation.findMany({
            where: { matchId, status: 'CONFIRMED' },
            select: { userId: true, places: true },
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
          occupied !== match.totalPlaces - match.availablePlaces ||
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
        await tx.participation.update({
          where: { userId_matchId: { userId, matchId } },
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
        return tx.reservation.update({
          where: { id: reservationId },
          data: {
            status: 'CANCELLED',
            cancelledAt,
            cancellationReason: reason?.trim() || null,
          },
          select: historyProjection,
        });
      },
      { maxWait: 10_000 },
    );
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
    @Body() dto: CancelReservationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.cancel(
      await this.auth.requireUser(req),
      params.id,
      params.reservationId,
      dto.reason,
    );
  }
}
@Module({
  imports: [AuthModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}

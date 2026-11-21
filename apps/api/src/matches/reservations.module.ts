import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiExtraModels, ApiOkResponse, ApiProperty, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { MatchIdDto } from './dto/match-id.dto.js';

export class CreateReservationDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647, example: 1 })
  @IsInt() @Min(1) @Max(2147483647) places: number;
}
export class ReservationResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) matchId: string;
  @ApiProperty({ minimum: 1 }) places: number;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}
const projection = { id: true, matchId: true, places: true, createdAt: true } as const;
const conflict = (code: string, message: string) => new ConflictException({ code, message });

@Injectable()
export class ReservationsService {
  constructor(private readonly db: PrismaService) {}
  async mine(userId: string, matchId: string) {
    if (!await this.db.match.findUnique({ where: { id: matchId }, select: { id: true } })) throw new NotFoundException();
    return this.db.reservation.findUnique({ where: { userId_matchId: { userId, matchId } }, select: projection });
  }
  async create(userId: string, matchId: string, places: number) {
    return this.db.$transaction(async tx => {
      // Consistent locking order serializes both daily participation and match capacity.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
      const existing = await tx.reservation.findUnique({ where: { userId_matchId: { userId, matchId } }, select: projection });
      if (existing) {
        if (existing.places !== places) throw conflict('RESERVATION_ALREADY_EXISTS', 'Ya tenés una reserva en este partido.');
        return existing;
      }
      const match = await tx.match.findUnique({ where: { id: matchId } });
      if (!match) throw new NotFoundException();
      if (match.organizerId === userId) throw conflict('OWN_MATCH', 'No podés reservar tu propio partido.');
      if (match.status !== 'OPEN' || match.startsAt <= new Date()) throw conflict('MATCH_UNAVAILABLE', 'El partido no está disponible para inscripciones.');
      if (match.availablePlaces < places) throw conflict('MATCH_FULL', 'No quedan suficientes lugares disponibles.');
      const [{ localDate }] = await tx.$queryRaw<{ localDate: Date }[]>`
        SELECT (${match.startsAt}::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "localDate"
      `;
      if (await tx.participation.findFirst({ where: { userId, localDate, active: true }, select: { id: true } })) {
        throw conflict('DAILY_PARTICIPATION_CONFLICT', 'Ya participás en un partido en esta fecha.');
      }
      const changed = await tx.match.updateMany({
        where: { id: matchId, status: 'OPEN', startsAt: { gt: new Date() }, availablePlaces: { gte: places } },
        data: { availablePlaces: { decrement: places } },
      });
      if (!changed.count) throw conflict('MATCH_UNAVAILABLE', 'El partido ya no está disponible.');
      if (match.availablePlaces === places) await tx.match.update({ where: { id: matchId }, data: { status: 'CLOSED' } });
      await tx.participation.create({ data: { userId, matchId, role: 'PLAYER', localDate } });
      return tx.reservation.create({ data: { userId, matchId, places }, select: projection });
    }, { maxWait: 10_000 });
  }
}
@ApiExtraModels(ReservationResponse)
@ApiTags('Reservations')
@Controller('matches/:id/reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService, private readonly auth: AuthService) {}
  @ApiOkResponse({ schema: { allOf: [{ $ref: getSchemaPath(ReservationResponse) }], nullable: true }, description: 'Reserva propia o null.' })
  @Get('me')
  async mine(@Param() params: MatchIdDto, @Req() req: Request, @Res() res: Response) {
    res.set('Cache-Control', 'no-store');
    return res.json(await this.service.mine(await this.auth.requireUser(req), params.id));
  }
  @ApiCreatedResponse({ type: ReservationResponse })
  @Post()
  async create(@Param() params: MatchIdDto, @Body() dto: CreateReservationDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.set('Cache-Control', 'no-store');
    return this.service.create(await this.auth.requireUser(req), params.id, dto.places);
  }
}
@Module({ imports: [AuthModule], controllers: [ReservationsController], providers: [ReservationsService] })
export class ReservationsModule {}

import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import {
  CreateMatchDto,
  CreatedMatchResponse,
  MatchHistoryQueryDto,
  MatchIdDto,
  MatchHistoryResponse,
  MatchManagementResponse,
} from './create-match.dto.js';
import { MatchPublicationService } from './match-publication.service.js';

@ApiTags('Matches')
@ApiUnauthorizedResponse({ description: 'Sesión requerida.' })
@Controller('matches')
export class MatchPublicationController {
  constructor(
    private readonly service: MatchPublicationService,
    private readonly auth: AuthService,
  ) {}
  @ApiCreatedResponse({ type: CreatedMatchResponse })
  @ApiBadRequestResponse({
    description: 'Payload, fecha o catálogo inválidos.',
  })
  @ApiConflictResponse({
    description: 'Ya existe una participación activa en la fecha local.',
  })
  @ApiForbiddenResponse({ description: 'Origin o CSRF inválidos.' })
  @Post()
  async create(@Body() dto: CreateMatchDto, @Req() req: Request) {
    return this.service.create(await this.auth.requireUser(req), dto);
  }
  @ApiOkResponse({
    type: MatchManagementResponse,
    description: 'Auditoría y capacidad privadas del organizador.',
  })
  @ApiForbiddenResponse({ description: 'Partido ajeno.' })
  @Get(':id/management')
  async management(@Param() params: MatchIdDto, @Req() req: Request) {
    return this.service.management(await this.auth.requireUser(req), params.id);
  }
  @ApiOkResponse({
    type: MatchHistoryResponse,
    description: 'Historial privado, tres eventos por página.',
  })
  @ApiForbiddenResponse({ description: 'Partido ajeno.' })
  @Get(':id/history')
  async history(
    @Param() params: MatchIdDto,
    @Query() query: MatchHistoryQueryDto,
    @Req() req: Request,
  ) {
    return this.service.history(
      await this.auth.requireUser(req),
      params.id,
      query.page,
    );
  }
}

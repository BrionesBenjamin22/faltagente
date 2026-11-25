import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
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
} from './dto/match-publication.dto.js';
import { MatchManagementResponse } from './dto/match-management.dto.js';
import { MatchIdDto } from './dto/match-id.dto.js';
import { MatchManagementService } from './match-management.service.js';
import { CancelMatchDto, UpdateMatchDto } from './dto/match-update.dto.js';

@ApiTags('Matches')
@ApiUnauthorizedResponse({ description: 'Sesión requerida.' })
@Controller('matches')
export class MatchPublicationController {
  constructor(
    private readonly service: MatchManagementService,
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
  @Patch(':id')
  @ApiOkResponse({ type: CreatedMatchResponse })
  @ApiBadRequestResponse({ description: 'Cambios o catálogo inválidos.' })
  @ApiConflictResponse({
    description: 'Versión, participación diaria o capacidad en conflicto.',
  })
  @ApiForbiddenResponse({
    description: 'Partido ajeno, Origin o CSRF inválidos.',
  })
  async update(
    @Param() params: MatchIdDto,
    @Body() dto: UpdateMatchDto,
    @Req() req: Request,
  ) {
    return this.service.update(
      await this.auth.requireUser(req),
      params.id,
      dto,
    );
  }

  @Post(':id/cancel')
  @ApiCreatedResponse({ type: CreatedMatchResponse })
  @ApiConflictResponse({
    description:
      'Versión en conflicto, partido iniciado o reservas inconsistentes.',
  })
  @ApiForbiddenResponse({
    description: 'Partido ajeno, Origin o CSRF inválidos.',
  })
  async cancel(
    @Param() params: MatchIdDto,
    @Body() dto: CancelMatchDto,
    @Req() req: Request,
  ) {
    return this.service.cancel(
      await this.auth.requireUser(req),
      params.id,
      dto,
    );
  }
  @ApiOkResponse({
    type: MatchManagementResponse,
    description: 'Capacidad y permisos del organizador.',
  })
  @ApiForbiddenResponse({ description: 'Partido ajeno.' })
  @Get(':id/management')
  async management(@Param() params: MatchIdDto, @Req() req: Request) {
    return this.service.management(await this.auth.requireUser(req), params.id);
  }
}

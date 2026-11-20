import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { MatchManagementService } from './match-management.service.js';
import { MyMatchesQueryDto, MyMatchesResponse } from './dto/my-matches.dto.js';

@ApiTags('Matches')
@Controller('users/me/matches')
export class MyMatchesController {
  constructor(private readonly service: MatchManagementService, private readonly auth: AuthService) {}

  @ApiOkResponse({ type: MyMatchesResponse })
  @ApiBadRequestResponse({ description: 'Filtro o página inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Sesión requerida.' })
  @Get()
  async list(@Query() query: MyMatchesQueryDto, @Req() req: Request) {
    return this.service.ownList(await this.auth.requireUser(req), query);
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { MatchesResponse } from './dto/matches-response.dto.js';
import { MatchDetailResponse } from './dto/match-detail-response.dto.js';
import { MatchIdDto } from './dto/match-id.dto.js';
import { MatchesQueryDto } from './dto/matches-query.dto.js';
import { MatchesService } from './matches.service.js';

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

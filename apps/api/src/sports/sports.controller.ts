import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SportsResponse } from './sports-response.dto.js';
import { SportsService } from './sports.service.js';

@ApiTags('Sports')
@Controller('sports')
export class SportsController {
  constructor(private readonly sports: SportsService) {}

  @Get()
  @ApiOkResponse({ type: SportsResponse })
  list() {
    return this.sports.list();
  }
}

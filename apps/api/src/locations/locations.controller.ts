import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { LocationsResponse } from './locations-response.dto.js';
import { LocationsService } from './locations.service.js';

@ApiTags('Locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}
  @ApiOkResponse({ type: LocationsResponse }) @Get() list() {
    return this.service.list();
  }
}

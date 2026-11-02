import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.module.js';
import { SportsResponse } from '../common/http/response.dto.js';

@Injectable()
export class SportsService {
  constructor(private readonly db: PrismaService) {}

  async list() {
    return {
      items: await this.db.sport.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          slug: true,
          formats: {
            where: { active: true },
            select: { id: true, name: true, slug: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    };
  }
}

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

@Module({ controllers: [SportsController], providers: [SportsService] })
export class SportsModule {}

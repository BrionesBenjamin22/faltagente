import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module.js';

@Injectable()
export class LocationsService {
  constructor(private readonly db: PrismaService) {}
  async list() {
    return {
      items: await this.db.location.findMany({
        where: { active: true, type: { in: ['CIUDAD', 'LOCALIDAD', 'BARRIO', 'ZONA'] } },
        select: { id: true, name: true, type: true, parentId: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 100,
      }),
    };
  }
}

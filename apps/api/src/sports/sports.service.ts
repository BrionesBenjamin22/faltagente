import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module.js';

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

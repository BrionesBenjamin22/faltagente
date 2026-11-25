import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module.js';

// Internal integration seam. No HTTP access or delivery side effects. Consumers
// retain their own cursor and deduplicate by event id. Domain lock orders commits.
@Injectable()
export class WaitlistEventsService {
  constructor(private readonly db: PrismaService) {}
  async readAfter(cursor = '0', limit = 100) {
    if (
      !/^\d+$/.test(cursor) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw new RangeError('Invalid event cursor or limit');
    const rows = await this.db.waitlistEvent.findMany({
      where: { sequence: { gt: BigInt(cursor) } },
      orderBy: { sequence: 'asc' },
      take: limit,
    });
    return {
      items: rows.map(({ sequence, ...event }) => ({
        ...event,
        cursor: sequence.toString(),
      })),
      nextCursor: rows.at(-1)?.sequence.toString() ?? cursor,
    };
  }
}

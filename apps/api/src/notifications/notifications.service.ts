import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  detail?: string;
  relatedMatchId?: string;
  actorUserId?: string;
  metadata?: Prisma.InputJsonValue;
  dedupeKey?: string;
  push?: boolean;
}

const notificationProjection = {
  id: true,
  type: true,
  title: true,
  body: true,
  detail: true,
  relatedMatchId: true,
  metadata: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  actorUser: { select: { id: true, name: true } },
  relatedMatch: {
    select: {
      id: true,
      startsAt: true,
      venueName: true,
      address: true,
      availablePlaces: true,
      totalPlaces: true,
      sport: { select: { id: true, name: true, slug: true } },
    },
  },
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly db: PrismaService) {}

  async create(input: CreateNotificationInput) {
    return this.db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        detail: input.detail ?? null,
        relatedMatchId: input.relatedMatchId ?? null,
        actorUserId: input.actorUserId ?? null,
        metadata: input.metadata ?? {},
        dedupeKey: input.dedupeKey ?? null,
      },
      select: notificationProjection,
    });
  }

  async safeCreate(input: CreateNotificationInput) {
    try {
      return await this.db.$transaction(async (tx) => {
        const notification = input.dedupeKey
          ? await tx.notification.upsert({
              where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
              create: {
                userId: input.userId,
                type: input.type,
                title: input.title,
                body: input.body,
                detail: input.detail ?? null,
                relatedMatchId: input.relatedMatchId ?? null,
                actorUserId: input.actorUserId ?? null,
                metadata: input.metadata ?? {},
                dedupeKey: input.dedupeKey,
              },
              update: {},
              select: notificationProjection,
            })
          : await tx.notification.create({
              data: {
                userId: input.userId,
                type: input.type,
                title: input.title,
                body: input.body,
                detail: input.detail ?? null,
                relatedMatchId: input.relatedMatchId ?? null,
                actorUserId: input.actorUserId ?? null,
                metadata: input.metadata ?? {},
              },
              select: notificationProjection,
            });
        if (input.dedupeKey) {
          if (input.push) {
          await tx.notificationJob.upsert({
            where: { eventKey: input.dedupeKey },
            create: {
              recipientId: input.userId,
              eventKey: input.dedupeKey,
              kind: input.type,
              payload: {
                notificationId: notification.id,
                title: 'Falta Gente',
                body: 'Tenés una actualización nueva.',
                matchId: input.relatedMatchId ?? null,
              },
            },
            update: {},
          });
          }
        }
        return notification;
      });
    } catch (error) {
      this.logger.error(
        `No se pudo crear la notificación ${input.type} para el usuario ${input.userId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  private async materializeMatchReminders(userId: string) {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const participations = await this.db.participation.findMany({
      where: {
        userId,
        active: true,
        match: {
          status: { in: ['OPEN', 'CLOSED'] },
          startsAt: { gt: now, lte: in24Hours },
        },
      },
      select: {
        role: true,
        match: {
          select: {
            id: true,
            startsAt: true,
            venueName: true,
            sport: { select: { name: true } },
          },
        },
      },
    });

    for (const participation of participations) {
      const match = participation.match;
      const window = match.startsAt <= in2Hours ? '2H' : '24H';
      const dedupeKey = `MATCH_REMINDER:${window}:${match.id}`;
      const existing = await this.db.notification.findUnique({
        where: { userId_dedupeKey: { userId, dedupeKey } },
        select: { id: true },
      });
      if (existing) continue;
      await this.safeCreate({
        userId,
        type: 'MATCH_REMINDER',
        title: 'Tu partido empieza pronto',
        body: `${match.sport.name} en ${match.venueName}`,
        detail: 'Revisá la hora y el lugar antes de salir.',
        relatedMatchId: match.id,
        dedupeKey,
        metadata: { reminderWindow: window, role: participation.role },
      });
    }
  }

  async unreadCount(userId: string) {
    return {
      unreadCount: await this.db.notification.count({
        where: { userId, isRead: false, isHidden: false },
      }),
    };
  }

  async list(
    userId: string,
    filter: 'all' | 'unread',
    page: number,
    pageSize: number,
  ) {
    const where = {
      userId,
      isHidden: false,
      ...(filter === 'unread' ? { isRead: false } : {}),
    };
    const [items, total, unreadCount] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        select: notificationProjection,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({
        where: { userId, isRead: false, isHidden: false },
      }),
    ]);
    return {
      items,
      total,
      unreadCount,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  async detail(userId: string, id: string) {
    const notification = await this.db.notification.findFirst({
      where: { id, userId, isHidden: false },
      select: notificationProjection,
    });
    if (!notification) throw new NotFoundException();
    return notification;
  }

  async markRead(userId: string, id: string) {
    const result = await this.db.notification.updateMany({
      where: { id, userId, isRead: false, isHidden: false },
      data: { isRead: true, readAt: new Date() },
    });
    if (!result.count) {
      const exists = await this.db.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException();
    }
    return { id };
  }

  async markAllRead(userId: string) {
    await this.db.notification.updateMany({
      where: { userId, isRead: false, isHidden: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: true };
  }

  async remove(userId: string, id: string) {
    const result = await this.db.notification.updateMany({
      where: { id, userId, isHidden: false },
      data: { isHidden: true, hiddenAt: new Date() },
    });
    if (!result.count) throw new NotFoundException();
  }
}

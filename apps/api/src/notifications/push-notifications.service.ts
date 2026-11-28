import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import type { Environment } from '../config/environment.js';
import { PrismaService } from '../prisma/prisma.module.js';
import type { PushSubscriptionDto } from './dto/push.dto.js';

@Injectable()
export class PushNotificationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  configDto() {
    const publicKey = this.config.get('VAPID_PUBLIC_KEY', { infer: true });
    return { available: !!publicKey, publicKey: publicKey ?? null };
  }

  private isSafePushEndpoint(endpoint: string) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '0.0.0.0' ||
      host.startsWith('169.254.') ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  }

  async subscribe(userId: string, dto: PushSubscriptionDto) {
    if (!this.isSafePushEndpoint(dto.endpoint))
      throw new ForbiddenException({
        code: 'INVALID_PUSH_SUBSCRIPTION',
        message: 'La suscripción del navegador no es válida.',
      });
    const existing = await this.db.pushSubscription.findUnique({
      where: { endpoint: dto.endpoint },
      select: { id: true, userId: true },
    });
    const subscription = existing
      ? await this.db.pushSubscription.update({
          where: { id: existing.id },
          data: {
            userId,
            p256dh: dto.keys.p256dh,
            auth: dto.keys.auth,
            active: true,
            revokedAt: null,
          },
          select: { id: true, endpoint: true },
        })
      : await this.db.pushSubscription.create({
          data: {
            userId,
            endpoint: dto.endpoint,
            p256dh: dto.keys.p256dh,
            auth: dto.keys.auth,
          },
          select: { id: true, endpoint: true },
        });
    return subscription;
  }

  async unsubscribe(userId: string, id: string) {
    const result = await this.db.pushSubscription.updateMany({
      where: { id, userId, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    if (!result.count)
      throw new ForbiddenException({
        code: 'PUSH_SUBSCRIPTION_NOT_OWNED',
        message: 'No pudimos retirar esta suscripción.',
      });
  }

  async revokeAll(userId: string) {
    await this.db.pushSubscription.updateMany({
      where: { userId, active: true },
      data: { active: false, revokedAt: new Date() },
    });
  }

  async process(token: string, limit: number) {
    const expected = this.config.get('NOTIFICATION_PROCESS_TOKEN', {
      infer: true,
    });
    if (!expected || token !== expected)
      throw new ForbiddenException({
        code: 'INTERNAL_NOTIFICATION_PROCESS_DENIED',
        message: 'Credencial de servicio inválida.',
      });
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) limit = 20;
    await this.materializeReminders();
    const owner = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date();
    const jobs = await this.db.notificationJob.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        availableAt: { lte: now },
        OR: [{ leasedAt: null }, { leasedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } }],
      },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });
    let processed = 0;
    for (const job of jobs) {
      const claimed = await this.db.notificationJob.updateMany({
        where: {
          id: job.id,
          status: { in: ['PENDING', 'FAILED'] },
          OR: [{ leasedAt: null }, { leasedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } }],
        },
        data: { status: 'PROCESSING', leasedAt: now, leaseOwner: owner, attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      processed++;
      const subscriptions = await this.db.pushSubscription.findMany({
        where: { userId: job.recipientId, active: true },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
      let pendingFailures = 0;
      const valid = await this.isJobValid(job);
      if (!valid) {
        await this.db.notificationJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            leasedAt: null,
            leaseOwner: null,
            completedAt: now,
            lastError: null,
          },
        });
        continue;
      }
      for (const subscription of subscriptions) {
        const delivery = await this.db.pushDelivery.upsert({
          where: { jobId_subscriptionId: { jobId: job.id, subscriptionId: subscription.id } },
          create: { jobId: job.id, subscriptionId: subscription.id },
          update: {},
        });
        if (delivery.status === 'DELIVERED' || delivery.status === 'INVALID') continue;
        if (delivery.status === 'RETRY' && delivery.nextAttemptAt > now) {
          pendingFailures++;
          continue;
        }
        try {
          const payload =
            typeof job.payload === 'object' && job.payload !== null
              ? (job.payload as object)
              : {};
          await this.send(subscription, payload);
          await this.db.pushDelivery.update({
            where: { id: delivery.id },
            data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null, attempts: { increment: 1 } },
          });
        } catch (error) {
          const statusCode =
            typeof error === 'object' && error && 'statusCode' in error
              ? Number((error as { statusCode?: unknown }).statusCode)
              : 0;
          if (statusCode === 410 || statusCode === 404) {
            await this.db.pushSubscription.update({
              where: { id: subscription.id },
              data: { active: false, revokedAt: new Date() },
            });
            await this.db.pushDelivery.update({
              where: { id: delivery.id },
              data: { status: 'INVALID', lastError: 'Subscription no longer valid', attempts: { increment: 1 } },
            });
          } else {
            pendingFailures++;
            await this.db.pushDelivery.update({
              where: { id: delivery.id },
              data: {
                status: 'RETRY',
                nextAttemptAt: new Date(Date.now() + Math.min(60 * 60 * 1000, 60_000 * 2 ** delivery.attempts)),
                lastError: 'Temporary push delivery failure',
                attempts: { increment: 1 },
              },
            });
          }
        }
      }
      await this.db.notificationJob.update({
        where: { id: job.id },
        data: {
          status: pendingFailures ? 'FAILED' : 'COMPLETED',
          availableAt: pendingFailures ? new Date(Date.now() + 60_000) : undefined,
          leasedAt: null,
          leaseOwner: null,
          completedAt: pendingFailures ? null : new Date(),
          lastError: pendingFailures ? 'Temporary push delivery failure' : null,
        },
      });
    }
    return { processed };
  }

  private async isJobValid(job: {
    kind: string;
    recipientId: string;
    payload: unknown;
  }) {
    const payload =
      typeof job.payload === 'object' && job.payload !== null
        ? (job.payload as Record<string, unknown>)
        : {};
    const matchId =
      typeof payload.matchId === 'string' ? payload.matchId : null;
    const offerId =
      typeof payload.offerId === 'string' ? payload.offerId : null;
    if (job.kind === 'WAITLIST_OFFER') {
      if (!offerId) return false;
      const offer = await this.db.waitlistOffer.findUnique({
        where: { id: offerId },
        select: {
          status: true,
          expiresAt: true,
          entry: { select: { userId: true, matchId: true } },
        },
      });
      if (
        !offer ||
        offer.status !== 'PENDING' ||
        offer.expiresAt <= new Date() ||
        offer.entry.userId !== job.recipientId
      )
        return false;
      const match = await this.db.match.findUnique({
        where: { id: offer.entry.matchId },
        select: { status: true, startsAt: true },
      });
      return !!match &&
        match.status !== 'CANCELLED' &&
        match.startsAt > new Date();
    }
    if (job.kind === 'MATCH_REMINDER') {
      if (!matchId) return false;
      const participation = await this.db.participation.findFirst({
        where: {
          userId: job.recipientId,
          matchId,
          active: true,
        },
        select: { id: true },
      });
      if (!participation) return false;
      const match = await this.db.match.findUnique({
        where: { id: matchId },
        select: { status: true, startsAt: true },
      });
      return !!match &&
        match.status !== 'CANCELLED' &&
        match.startsAt > new Date() &&
        match.startsAt <= new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    if (job.kind === 'MATCH_CANCELLED') {
      if (!matchId) return false;
      const match = await this.db.match.findUnique({
        where: { id: matchId },
        select: { status: true },
      });
      return match?.status === 'CANCELLED';
    }
    if (matchId) {
      const match = await this.db.match.findUnique({
        where: { id: matchId },
        select: { status: true, startsAt: true },
      });
      if (!match || match.status === 'CANCELLED' || match.startsAt <= new Date())
        return false;
    }
    return true;
  }

  private async materializeReminders() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const participations = await this.db.participation.findMany({
      where: {
        active: true,
        match: {
          status: { in: ['OPEN', 'CLOSED'] },
          startsAt: { gt: now, lte: in24Hours },
        },
      },
      select: {
        userId: true,
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
      const eventKey = `MATCH_REMINDER:${window}:${match.id}:${participation.userId}`;
      const nearbyKey = `MATCH_REMINDER:24H:${match.id}:${participation.userId}`;
      if (window === '2H') {
        await this.db.notification.updateMany({
          where: { userId: participation.userId, dedupeKey: nearbyKey },
          data: { isHidden: true, hiddenAt: now },
        }).catch(() => undefined);
      }
      const existing = await this.db.notification.findUnique({
        where: { userId_dedupeKey: { userId: participation.userId, dedupeKey: eventKey } },
        select: { id: true },
      });
      if (existing) continue;
      const notification = await this.db.notification.create({
        data: {
          userId: participation.userId,
          type: 'MATCH_REMINDER',
          title: 'Tu partido empieza pronto',
          body: `${match.sport.name} en ${match.venueName}`,
          detail: 'Revisá la hora y el lugar antes de salir.',
          relatedMatchId: match.id,
          dedupeKey: eventKey,
          metadata: { reminderWindow: window, role: participation.role },
        },
      }).catch(() => null);
      if (!notification) continue;
      await this.db.notificationJob.upsert({
        where: { eventKey },
        create: {
          recipientId: participation.userId,
          eventKey,
          kind: 'MATCH_REMINDER',
          payload: {
            notificationId: notification.id,
            title: 'Falta Gente',
            body: 'Tenés una actualización nueva.',
            matchId: match.id,
          },
          availableAt: now,
        },
        update: {},
      });
    }
  }

  private async send(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: object,
  ) {
    const publicKey = this.config.get('VAPID_PUBLIC_KEY', { infer: true });
    const privateKey = this.config.get('VAPID_PRIVATE_KEY', { infer: true });
    const subject = this.config.get('VAPID_SUBJECT', { infer: true });
    if (!publicKey || !privateKey)
      throw new ServiceUnavailableException({
        code: 'PUSH_NOT_CONFIGURED',
        message: 'Las notificaciones push no están configuradas.',
      });
    webPush.setVapidDetails(subject ?? 'mailto:soporte@falta-gente.test', publicKey, privateKey);
    return webPush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 15 },
    );
  }
}

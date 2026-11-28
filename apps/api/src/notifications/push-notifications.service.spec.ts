import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.module.js';
import type { Environment } from '../config/environment.js';
import { PushNotificationsService } from './push-notifications.service.js';

function setup(overrides: Record<string, unknown> = {}) {
  const db = {
    pushSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    notificationJob: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    participation: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService;
  const config = {
    get: vi.fn((key: string) =>
      key === 'NOTIFICATION_PROCESS_TOKEN'
        ? 'service-secret'
        : key === 'VAPID_PUBLIC_KEY'
          ? 'public-key'
          : null,
    ),
  } as unknown as ConfigService<Environment, true>;
  return {
    db,
    service: new PushNotificationsService(db, config),
  };
}

describe('PushNotificationsService', () => {
  it('rejects private-network subscription endpoints', async () => {
    const { service } = setup();
    await expect(
      service.subscribe('user-1', {
        endpoint: 'https://127.0.0.1/push',
        keys: { p256dh: 'key', auth: 'auth' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reassigns an existing browser subscription to the authenticated account', async () => {
    const { service, db } = setup();
    vi.mocked(db.pushSubscription.findUnique).mockResolvedValue({
      id: 'subscription-1',
      userId: 'user-1',
    } as never);
    vi.mocked(db.pushSubscription.update).mockResolvedValue({
      id: 'subscription-1',
      endpoint: 'https://push.example.test/device',
    } as never);

    await service.subscribe('user-2', {
      endpoint: 'https://push.example.test/device',
      keys: { p256dh: 'new-key', auth: 'new-auth' },
    });

    expect(db.pushSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-2',
          p256dh: 'new-key',
          auth: 'new-auth',
          active: true,
        }),
      }),
    );
  });

  it('requires the independent service credential', async () => {
    const { service } = setup();
    await expect(service.process('wrong', 20)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

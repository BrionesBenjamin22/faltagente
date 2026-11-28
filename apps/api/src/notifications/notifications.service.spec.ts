import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.module.js';
import { NotificationsService } from './notifications.service.js';

function dbMock(overrides: Record<string, unknown> = {}) {
  return {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    participation: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
    ...overrides,
  } as unknown as PrismaService;
}

describe('NotificationsService', () => {
  it('creates a notification for the explicit recipient', async () => {
    const db = dbMock();
    const created = { id: 'notification-1' };
    vi.mocked(db.notification.create).mockResolvedValue(created as never);
    const service = new NotificationsService(db);

    await service.create({
      userId: 'user-1',
      type: 'RESERVATION_CONFIRMED',
      title: 'Te sumaste',
      body: 'Reserva confirmada',
      dedupeKey: 'reservation-1',
    });

    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'RESERVATION_CONFIRMED',
        dedupeKey: 'reservation-1',
      }),
    }));
  });

  it('does not expose another users notification when reading detail', async () => {
    const db = dbMock();
    vi.mocked(db.notification.findFirst).mockResolvedValue(null);
    const service = new NotificationsService(db);

    await expect(service.detail('user-1', 'notification-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.notification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'notification-2', userId: 'user-1', isHidden: false },
    }));
  });

  it('marks a notification read only for its owner', async () => {
    const db = dbMock();
    vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 1 } as never);
    const service = new NotificationsService(db);

    await service.markRead('user-1', 'notification-1');
    expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'notification-1', userId: 'user-1', isRead: false, isHidden: false },
    }));
  });

  it('hides only a notification owned by the authenticated user', async () => {
    const db = dbMock();
    vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 1 } as never);
    const service = new NotificationsService(db);

    await service.remove('user-1', 'notification-1');
    expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'notification-1', userId: 'user-1', isHidden: false },
      data: expect.objectContaining({ isHidden: true }),
    }));
  });
});

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationOutboxStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ReservationNotificationPayload } from './notification.types';

export type NotificationOutboxFilters = {
  status?: NotificationOutboxStatus;
  search?: string;
  limit?: number;
  offset?: number;
};

export type NotificationOutboxItem = {
  id: string;
  type: string;
  status: NotificationOutboxStatus;
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
  guestContact: string | null;
  event: ReservationNotificationPayload['event'];
  channel: ReservationNotificationPayload['channel'];
  language: string | null;
  reservation: {
    id: string | null;
    code: string | null;
    status: ReservationStatus | null;
    guestName: string | null;
    slotLocalDate: string | null;
    slotLocalTime: string | null;
    venueName: string | null;
  };
};

export type NotificationOutboxList = {
  items: NotificationOutboxItem[];
  total: number;
};

@Injectable()
export class NotificationsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filters: NotificationOutboxFilters = {},
  ): Promise<NotificationOutboxList> {
    const where = this.buildWhere(filters);
    const limit = this.clamp(filters.limit ?? 25, 1, 100);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notificationOutbox.count({ where }),
      this.prisma.notificationOutbox.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          reservation: {
            include: { venue: true },
          },
        },
      }),
    ]);

    const items = rows.map((row) => this.toDto(row));
    return { items, total };
  }

  async requeue(id: string): Promise<NotificationOutboxItem> {
    const existing = await this.prisma.notificationOutbox.findUnique({
      where: { id },
      include: { reservation: { include: { venue: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    if (existing.status !== NotificationOutboxStatus.FAILED) {
      throw new BadRequestException(
        'Only failed notifications can be requeued',
      );
    }

    const updated = await this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        status: NotificationOutboxStatus.PENDING,
        attempts: 0,
        lastError: null,
        scheduledAt: new Date(),
      },
      include: { reservation: { include: { venue: true } } },
    });
    return this.toDto(updated);
  }

  private buildWhere(filters: NotificationOutboxFilters) {
    const where: Prisma.NotificationOutboxWhereInput = {};
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.search) {
      const term = filters.search.trim();
      if (term) {
        where.OR = [
          { guestContact: { contains: term, mode: 'insensitive' } },
          { type: { contains: term, mode: 'insensitive' } },
          {
            reservation: {
              OR: [
                { code: { contains: term, mode: 'insensitive' } },
                { guestName: { contains: term, mode: 'insensitive' } },
              ],
            },
          },
        ];
      }
    }
    return where;
  }

  private clamp(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private toDto(
    row: Prisma.NotificationOutboxGetPayload<{
      include: { reservation: { include: { venue: true } } };
    }>,
  ): NotificationOutboxItem {
    const payload = this.normalizePayload(row.payload);
    const reservation = row.reservation;
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      scheduledAt: row.scheduledAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      guestContact: row.guestContact,
      event: payload?.event ?? 'created',
      channel: payload?.channel ?? 'email',
      language: payload?.language ?? null,
      reservation: {
        id: reservation?.id ?? null,
        code: reservation?.code ?? null,
        status: reservation?.status ?? null,
        guestName: reservation?.guestName ?? null,
        slotLocalDate: reservation?.slotLocalDate ?? null,
        slotLocalTime: reservation?.slotLocalTime ?? null,
        venueName: reservation?.venue?.name ?? null,
      },
    };
  }

  private normalizePayload(
    payload: Prisma.JsonValue,
  ): ReservationNotificationPayload | null {
    if (!payload || typeof payload !== 'object') return null;
    return payload as ReservationNotificationPayload;
  }
}

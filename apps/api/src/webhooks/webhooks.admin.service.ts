import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WebhookDeliveryStatus,
  WebhookEvent as PrismaWebhookEvent,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import {
  ReservationWebhookEvent,
  WebhookDeliveryDto,
  WebhookDeliveryListResponse,
  WebhookEndpointDto,
  WebhookPayload,
  WebhookSecretPreview,
} from './webhook.types';
import {
  ALL_RESERVATION_EVENTS,
  toPrismaEvent,
  toReservationEvent,
} from './webhook.events';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';

type EndpointRecord = Prisma.WebhookEndpointGetPayload<{
  include: { deliveries: false };
}>;

type DeliveryRecord = Prisma.WebhookDeliveryGetPayload<{
  include: { endpoint: true };
}>;

type DeliveryFilters = {
  endpointId?: string;
  status?: WebhookDeliveryStatus;
  limit?: number;
  offset?: number;
  page?: number;
};

@Injectable()
export class WebhooksAdminService {
  private readonly logger = new Logger(WebhooksAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createEndpoint(
    dto: CreateWebhookEndpointDto,
  ): Promise<WebhookEndpointDto> {
    const url = dto.url.trim();
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const description =
      dto.description && dto.description.trim().length > 0
        ? dto.description.trim()
        : null;

    const events = this.normalizeEvents(dto.events);
    const secret = this.generateSecret();
    const timestamp = new Date();

    try {
      const endpoint = await this.prisma.webhookEndpoint.create({
        data: {
          url,
          description,
          events,
          secret,
          secretCreatedAt: timestamp,
          secretRotatedAt: timestamp,
        },
      });
      this.logger.log(`Created webhook endpoint ${endpoint.id} (${url})`);
      return {
        ...this.toEndpointDto(endpoint),
        secret,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A webhook endpoint with this URL already exists',
        );
      }
      throw error;
    }
  }

  async listEndpoints(): Promise<WebhookEndpointDto[]> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return endpoints.map((endpoint) => this.toEndpointDto(endpoint));
  }

  async listDeliveries(
    filters: DeliveryFilters = {},
  ): Promise<WebhookDeliveryListResponse> {
    const where: Prisma.WebhookDeliveryWhereInput = {};
    if (filters.endpointId) {
      where.endpointId = filters.endpointId;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const take =
      typeof filters.limit === 'number' && Number.isFinite(filters.limit)
        ? Math.max(1, Math.min(100, Math.floor(filters.limit)))
        : 25;

    let skip =
      typeof filters.offset === 'number' && Number.isFinite(filters.offset)
        ? Math.max(0, Math.floor(filters.offset))
        : 0;

    if (
      typeof filters.page === 'number' &&
      Number.isFinite(filters.page) &&
      filters.page > 0
    ) {
      skip = (Math.floor(filters.page) - 1) * take;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.webhookDelivery.findMany({
        where,
        include: { endpoint: true },
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);

    return {
      items: items.map((entry) => this.toDeliveryDto(entry)),
      total,
    };
  }

  async redeliver(id: string): Promise<WebhookDeliveryDto> {
    if (!id) {
      throw new BadRequestException('Delivery id is required');
    }

    let delivery: DeliveryRecord;
    try {
      delivery = await this.prisma.webhookDelivery.update({
        where: { id },
        data: {
          status: WebhookDeliveryStatus.PENDING,
          attempts: 0,
          lastError: null,
          failureReason: null,
          failedAt: null,
          nextAttemptAt: new Date(),
          deliveredAt: null,
        },
        include: { endpoint: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Delivery not found');
      }
      throw error;
    }
    this.logger.log(`Requeued webhook delivery ${delivery.id}`);
    return this.toDeliveryDto(delivery);
  }

  async getSecretPreview(endpointId: string): Promise<WebhookSecretPreview> {
    if (!endpointId) {
      throw new BadRequestException('endpointId is required');
    }
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
    });
    if (!endpoint) {
      throw new NotFoundException('Endpoint not found');
    }
    return this.buildSecretPreview(endpoint);
  }

  private toEndpointDto(record: EndpointRecord): WebhookEndpointDto {
    return {
      id: record.id,
      url: record.url,
      description: record.description ?? null,
      isActive: record.isActive,
      events: this.projectEvents(record),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      secretPreview: this.buildSecretPreview(record),
    };
  }

  private toDeliveryDto(record: DeliveryRecord): WebhookDeliveryDto {
    const payload = this.parsePayload(record);
    return {
      id: record.id,
      endpointId: record.endpointId,
      event: this.toReservationEvent(record.event),
      status: record.status,
      attempts: record.attempts,
      lastError: record.lastError ?? null,
      nextAttemptAt: record.nextAttemptAt.toISOString(),
      lastAttemptAt: record.updatedAt.toISOString(),
      deliveredAt: record.deliveredAt ? record.deliveredAt.toISOString() : null,
      failureReason: record.failureReason ?? null,
      failedAt: record.failedAt ? record.failedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      payload,
      endpoint: record.endpoint
        ? this.toEndpointDto(record.endpoint)
        : undefined,
    };
  }

  private toReservationEvent(
    event: PrismaWebhookEvent,
  ): ReservationWebhookEvent {
    return toReservationEvent(event);
  }

  private parsePayload(record: DeliveryRecord): WebhookPayload {
    const raw = record.payload;
    if (
      raw &&
      typeof raw === 'object' &&
      raw !== null &&
      'reservation' in raw
    ) {
      const payload = raw as WebhookPayload;
      if (payload.reservation) {
        return payload;
      }
    }

    this.logger.warn(
      `Webhook delivery ${record.id} has an invalid payload shape`,
    );

    return {
      reservation: {
        id: record.reservationId ?? '',
        venueId: '',
        code: '',
        status: this.toReservationEvent(record.event),
        guestName: null,
        guestEmail: null,
        guestPhone: null,
        partySize: 0,
        slotLocalDate: '',
        slotLocalTime: '',
        slotStartUtc: '',
        durationMinutes: null,
        notes: null,
        channel: null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        venue: null,
      },
    };
  }

  private normalizeEvents(
    events?: ReservationWebhookEvent[],
  ): PrismaWebhookEvent[] {
    const source =
      Array.isArray(events) && events.length > 0
        ? events
        : ALL_RESERVATION_EVENTS;
    const unique = Array.from(new Set(source));
    return unique.map((event) => toPrismaEvent(event));
  }

  private projectEvents(record: EndpointRecord): ReservationWebhookEvent[] {
    if (!record.events || record.events.length === 0) {
      return [...ALL_RESERVATION_EVENTS];
    }
    return record.events.map((evt) => this.toReservationEvent(evt));
  }

  private buildSecretPreview(record: EndpointRecord): WebhookSecretPreview {
    const secret = record.secret ?? '';
    const lastFour =
      secret.length >= 4 ? secret.slice(-4) : secret.padStart(4, '*');
    return {
      endpointId: record.id,
      lastFour,
      secretCreatedAt: (
        record.secretCreatedAt ?? record.createdAt
      ).toISOString(),
      secretRotatedAt: record.secretRotatedAt
        ? record.secretRotatedAt.toISOString()
        : null,
    };
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex');
  }
}

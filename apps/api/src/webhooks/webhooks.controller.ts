import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WebhookDeliveryStatus } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { ApiCreatedResponse, ApiOkResponse, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { WebhooksAdminService } from './webhooks.admin.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import {
  WebhookDeliveryListResponse,
  WebhookEndpointDto,
  WebhookSecretResponse,
} from './webhook.types';

const WebhookEndpointSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    url: { type: 'string', format: 'uri' },
    description: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'url', 'isActive', 'createdAt', 'updatedAt'],
};

const WebhookEndpointListSchema: SchemaObject = {
  type: 'array',
  items: WebhookEndpointSchema,
};

const WebhookVenueSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', nullable: true },
    timezone: { type: 'string', nullable: true },
  },
  required: ['id', 'name', 'timezone'],
};

const WebhookReservationSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    venueId: { type: 'string' },
    code: { type: 'string' },
    status: { type: 'string' },
    guestName: { type: 'string', nullable: true },
    guestEmail: { type: 'string', nullable: true },
    guestPhone: { type: 'string', nullable: true },
    partySize: { type: 'integer' },
    slotLocalDate: { type: 'string' },
    slotLocalTime: { type: 'string' },
    slotStartUtc: { type: 'string', format: 'date-time' },
    durationMinutes: { type: 'integer', nullable: true },
    notes: { type: 'string', nullable: true },
    channel: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    venue: { ...WebhookVenueSchema, nullable: true } as SchemaObject,
  },
  required: [
    'id',
    'venueId',
    'code',
    'status',
    'partySize',
    'slotLocalDate',
    'slotLocalTime',
    'slotStartUtc',
    'createdAt',
    'updatedAt',
  ],
};

const WebhookPayloadSchema: SchemaObject = {
  type: 'object',
  properties: {
    reservation: WebhookReservationSchema,
  },
  required: ['reservation'],
};

const WebhookDeliverySchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    endpointId: { type: 'string' },
    event: {
      type: 'string',
      enum: [
        'reservation.created',
        'reservation.updated',
        'reservation.cancelled',
        'reservation.seated',
        'reservation.completed',
      ],
    },
    status: {
      type: 'string',
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
    },
    attempts: { type: 'integer' },
    lastError: { type: 'string', nullable: true },
    nextAttemptAt: { type: 'string', format: 'date-time' },
    deliveredAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    payload: WebhookPayloadSchema,
    endpoint: { ...WebhookEndpointSchema, nullable: true } as SchemaObject,
  },
  required: [
    'id',
    'endpointId',
    'event',
    'status',
    'attempts',
    'nextAttemptAt',
    'createdAt',
    'updatedAt',
    'payload',
  ],
};

const WebhookDeliveryListSchema: SchemaObject = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: WebhookDeliverySchema,
    },
    total: { type: 'integer' },
  },
  required: ['items', 'total'],
};

const WebhookSecretSchema: SchemaObject = {
  type: 'object',
  properties: {
    secret: { type: 'string' },
  },
  required: ['secret'],
};

@ApiTags('Webhooks')
@ApiSecurity('ApiKeyAuth')
@UseGuards(ApiKeyGuard, RateLimitGuard)
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksAdminService) {}

  @Post('endpoints')
  @ApiCreatedResponse({ content: { 'application/json': { schema: WebhookEndpointSchema } } })
  createEndpoint(
    @Body() dto: CreateWebhookEndpointDto,
  ): Promise<WebhookEndpointDto> {
    return this.webhooks.createEndpoint(dto);
  }

  @Get('endpoints')
  @ApiOkResponse({ content: { 'application/json': { schema: WebhookEndpointListSchema } } })
  listEndpoints(): Promise<WebhookEndpointDto[]> {
    return this.webhooks.listEndpoints();
  }

  @Get('deliveries')
  @ApiQuery({ name: 'endpointId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: WebhookDeliveryStatus,
    description: 'Filter by delivery status',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Defaults to 25 results',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Skip N results for pagination',
  })
  @ApiOkResponse({ content: { 'application/json': { schema: WebhookDeliveryListSchema } } })
  listDeliveries(
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<WebhookDeliveryListResponse> {
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedOffset = offset ? Number(offset) : undefined;

    return this.webhooks.listDeliveries({
      endpointId: endpointId?.trim() || undefined,
      status: this.normalizeStatus(status),
      limit:
        parsedLimit !== undefined && Number.isFinite(parsedLimit)
          ? parsedLimit
          : undefined,
      offset:
        parsedOffset !== undefined && Number.isFinite(parsedOffset)
          ? parsedOffset
          : undefined,
    });
  }

  @ApiParam({ name: 'id', type: String })
  @RateLimit({ requestsPerMinute: 120, burstLimit: 60 })
  @Post('deliveries/:id/redeliver')
  @ApiOkResponse({ content: { 'application/json': { schema: WebhookDeliverySchema } } })
  redeliver(@Param('id') id: string) {
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('Invalid delivery id');
    }
    return this.webhooks.redeliver(id);
  }

  @Get('secret')
  @ApiOkResponse({ content: { 'application/json': { schema: WebhookSecretSchema } } })
  getSecret() {
    const secret = process.env.WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new BadRequestException('WEBHOOK_SECRET is not configured');
    }
    return { secret };
  }

  private normalizeStatus(
    status?: WebhookDeliveryStatus,
  ): WebhookDeliveryStatus | undefined {
    if (!status) return undefined;
    const value = String(status).toUpperCase();
    switch (value) {
      case WebhookDeliveryStatus.PENDING:
        return WebhookDeliveryStatus.PENDING;
      case WebhookDeliveryStatus.SUCCESS:
        return WebhookDeliveryStatus.SUCCESS;
      case WebhookDeliveryStatus.FAILED:
        return WebhookDeliveryStatus.FAILED;
      default:
        return undefined;
    }
  }
}

import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type AuditLogPayload = Record<string, unknown> | null | undefined;

export type AuditMetadata = {
  route?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  tenantId?: string;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    actor: string;
    action: string;
    resource: string;
    before?: AuditLogPayload;
    after?: AuditLogPayload;
    route?: string;
    method?: string;
    statusCode?: number;
    requestId?: string;
    tenantId?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actor: params.actor,
        action: params.action,
        resource: params.resource,
        before: this.toJsonValue(params.before),
        after: this.toJsonValue(params.after),
        route: this.normalizeString(params.route),
        method: this.normalizeString(params.method),
        statusCode: this.normalizeStatus(params.statusCode),
        requestId: this.normalizeString(params.requestId),
        tenantId: this.normalizeString(params.tenantId),
      },
    });
  }

  async list(params: {
    limit: number;
    offset: number;
    actor?: string;
    route?: string;
    method?: string;
    tenantId?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ total: number; items: AuditLog[] }> {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.actor) {
      where.actor = { contains: params.actor.trim(), mode: 'insensitive' };
    }
    if (params.route) {
      where.route = { contains: params.route.trim(), mode: 'insensitive' };
    }
    if (params.method) {
      where.method = { equals: params.method.trim(), mode: 'insensitive' };
    }
    if (params.tenantId) {
      where.tenantId = {
        contains: params.tenantId.trim(),
        mode: 'insensitive',
      };
    }
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) {
        where.createdAt.gte = params.from;
      }
      if (params.to) {
        where.createdAt.lte = params.to;
      }
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: Math.max(params.offset, 0),
        take: Math.min(Math.max(params.limit, 1), 200),
      }),
    ]);

    return { total, items };
  }

  private toJsonValue(
    payload: AuditLogPayload,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (payload === null || payload === undefined) {
      return Prisma.JsonNull;
    }
    return JSON.parse(
      JSON.stringify(payload, (_key, value) =>
        value === undefined ? null : value,
      ),
    );
  }

  private normalizeString(value?: string): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeStatus(value?: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.floor(value));
  }
}

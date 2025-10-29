import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type AuditLogPayload = Record<string, unknown> | null | undefined;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    actor: string;
    action: string;
    resource: string;
    before?: AuditLogPayload;
    after?: AuditLogPayload;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actor: params.actor,
        action: params.action,
        resource: params.resource,
        before: this.toJsonValue(params.before),
        after: this.toJsonValue(params.after),
      },
    });
  }

  async list(params: {
    limit: number;
    offset: number;
    actor?: string;
    action?: string;
    resource?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ total: number; items: AuditLog[] }> {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.actor) {
      where.actor = { contains: params.actor.trim(), mode: 'insensitive' };
    }
    if (params.action) {
      where.action = { contains: params.action.trim(), mode: 'insensitive' };
    }
    if (params.resource) {
      where.resource = {
        contains: params.resource.trim(),
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
}

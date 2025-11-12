import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const key = req.header('x-api-key')?.trim();
    const handler = ctx.getHandler();
    const cls = ctx.getClass();
    const isPublic =
      Reflect.getMetadata('isPublic', handler) ??
      Reflect.getMetadata('isPublic', cls);
    if (!key && isPublic) return true;
    if (!key) throw new UnauthorizedException('Missing x-api-key');

    const hashedKey = createHash('sha256').update(key).digest('hex');
    const record = await this.prisma.apiKey.findFirst({
      where: { hashedKey, isActive: true },
    });
    if (!record) throw new UnauthorizedException('Invalid API key');

    req.apiKeyId = record.id;
    // Default tenant from API key (can be overridden by TenantGuard if allowed)
    req.tenantId = record.tenantId;
    const scopes = parseScopes(record.scopeJSON);
    req.actor = { kind: 'service', roles: scopesToRoles(scopes) };
    void this.prisma.apiKey
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    return true;
  }
}

function parseScopes(value: Prisma.JsonValue | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : null))
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === 'object' && value !== null && 'scopes' in value) {
    const payload = value as { scopes?: unknown };
    if (Array.isArray(payload.scopes)) {
      return payload.scopes
        .map((item) => (typeof item === 'string' ? item : null))
        .filter((item): item is string => Boolean(item));
    }
  }
  return [];
}

function scopesToRoles(scopes: string[]): string[] {
  const roles = new Set<string>(['integration']);
  for (const scope of scopes) {
    if (scope === 'admin') {
      roles.add('admin');
    } else if (scope === 'provider') {
      roles.add('provider');
    }
  }
  return Array.from(roles);
}

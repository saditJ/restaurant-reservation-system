import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
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
    req.actor = { kind: 'service', roles: ['integration'] };
    void this.prisma.apiKey
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    return true;
  }
}

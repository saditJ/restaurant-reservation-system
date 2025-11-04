import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const handler = ctx.getHandler();
    const cls = ctx.getClass();
    const isPublic =
      Reflect.getMetadata('isPublic', handler) ??
      Reflect.getMetadata('isPublic', cls);
    const req = ctx.switchToHttp().getRequest();

    // Allow explicit tenant header override (future: restrict to provider keys)
    const headerTenant = req.header('x-tenant-id');
    if (headerTenant) req.tenantId = headerTenant;

    if (isPublic) return true;
    if (!req.tenantId) throw new BadRequestException('Tenant context is required');
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const handler = ctx.getHandler();
    const cls = ctx.getClass();
    const required: string[] =
      Reflect.getMetadata('roles', handler) ??
      Reflect.getMetadata('roles', cls) ??
      [];
    if (!required.length) return true;
    const req = ctx.switchToHttp().getRequest();
    const roles = req.actor?.roles ?? [];
    const ok = required.some((r) => roles.includes(r));
    if (!ok) throw new ForbiddenException('Insufficient role');
    return true;
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.tenantId as string | undefined;
});

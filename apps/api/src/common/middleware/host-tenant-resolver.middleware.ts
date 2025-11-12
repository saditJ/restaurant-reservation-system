import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getTenantIdFromHost } from '../../tenants/tenant-host.helper';

type TenantAwareRequest = Request & { tenantId?: string };

@Injectable()
export class HostTenantResolverMiddleware implements NestMiddleware {
  async use(req: TenantAwareRequest, _res: Response, next: NextFunction) {
    if (!req.tenantId) {
      const tenantId = await getTenantIdFromHost(req);
      if (tenantId) {
        req.tenantId = tenantId;
      }
    }
    next();
  }
}

export { getTenantIdFromHost } from '../../tenants/tenant-host.helper';

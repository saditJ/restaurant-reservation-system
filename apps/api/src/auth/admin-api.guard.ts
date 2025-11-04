import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedApiKey } from './api-key.service';

type ApiRequest = Request & {
  apiKey?: AuthenticatedApiKey;
  requestId?: string;
  tenantId?: string;
  apiKeyId?: string;
  actor?: {
    kind: 'service' | 'staff' | 'guest';
    userId?: string;
    roles?: string[];
  };
};

@Injectable()
export class AdminApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const key = request.apiKey;
    if (!key) {
      throw new ForbiddenException('Admin scope required');
    }
    if (!key.scopes.includes('admin')) {
      throw new ForbiddenException('Admin scope required');
    }
    return true;
  }
}

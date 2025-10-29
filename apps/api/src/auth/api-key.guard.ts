import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyService, AuthenticatedApiKey } from './api-key.service';

type ApiRequest = Request & { apiKey?: AuthenticatedApiKey };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const rawHeader = request.headers['x-api-key'];
    const plaintext =
      typeof rawHeader === 'string'
        ? rawHeader.trim()
        : Array.isArray(rawHeader)
        ? rawHeader[0]?.trim()
        : undefined;

    if (!plaintext) {
      throw new UnauthorizedException('Missing API key');
    }

    const record = await this.apiKeys.findByPlaintextKey(plaintext);
    if (!record) {
      throw new ForbiddenException('Invalid API key');
    }
    if (!record.isActive) {
      throw new ForbiddenException('API key disabled');
    }

    request.apiKey = this.apiKeys.toAuthenticated(record);
    void this.apiKeys.touchLastUsed(record.id);

    return true;
  }
}

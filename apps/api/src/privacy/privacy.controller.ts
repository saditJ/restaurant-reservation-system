import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import type { AuthenticatedApiKey } from '../auth/api-key.service';
import { PrivacyService, PrivacyEraseResponse, PrivacyExportResponse } from './privacy.service';

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

type EraseRequestBody = {
  email: string;
};

@Controller('v1/privacy/guest')
@UseGuards(ApiKeyGuard, AdminApiGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('export')
  async export(
    @Req() req: ApiRequest,
    @Query('email') email: string,
  ): Promise<PrivacyExportResponse> {
    const actor = formatActor(req.apiKey);
    return this.privacy.exportGuestData(actor, email);
  }

  @Post('erase')
  async erase(
    @Req() req: ApiRequest,
    @Body() body: EraseRequestBody,
  ): Promise<PrivacyEraseResponse> {
    const actor = formatActor(req.apiKey);
    return this.privacy.eraseGuestData(actor, body.email);
  }
}

function formatActor(key: AuthenticatedApiKey | undefined): string {
  if (!key) return 'unknown';
  return `api-key:${key.id}`;
}

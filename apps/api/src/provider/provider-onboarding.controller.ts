import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import type { AuthenticatedApiKey } from '../auth/api-key.service';
import {
  ProviderOnboardingApiKeyDto,
  ProviderOnboardingShiftsDto,
  ProviderOnboardingTablesDto,
  ProviderOnboardingTenantDto,
  ProviderOnboardingVenueDto,
} from './dto';
import { ProviderOnboardingService } from './provider-onboarding.service';

type ProviderRequest = Request & {
  apiKey?: AuthenticatedApiKey;
  requestId?: string;
};

@Roles('owner', 'provider')
@UseGuards(RateLimitGuard)
@Controller('v1/provider/onboarding')
export class ProviderOnboardingController {
  constructor(private readonly onboarding: ProviderOnboardingService) {}

  @Post('tenant')
  @RateLimit({ requestsPerMinute: 20, burstLimit: 10 })
  async createTenant(
    @Body() body: ProviderOnboardingTenantDto,
    @Req() req: ProviderRequest,
  ) {
    return this.onboarding.upsertTenant(body, this.buildContext(req));
  }

  @Post('venue')
  @RateLimit({ requestsPerMinute: 20, burstLimit: 10 })
  async createVenue(
    @Body() body: ProviderOnboardingVenueDto,
    @Req() req: ProviderRequest,
  ) {
    return this.onboarding.upsertVenue(body, this.buildContext(req));
  }

  @Post('shifts')
  @RateLimit({ requestsPerMinute: 30, burstLimit: 15 })
  async seedShifts(
    @Body() body: ProviderOnboardingShiftsDto,
    @Req() req: ProviderRequest,
  ) {
    return this.onboarding.seedShifts(body, this.buildContext(req));
  }

  @Post('tables')
  @RateLimit({ requestsPerMinute: 30, burstLimit: 15 })
  async seedTables(
    @Body() body: ProviderOnboardingTablesDto,
    @Req() req: ProviderRequest,
  ) {
    return this.onboarding.seedTables(body, this.buildContext(req));
  }

  @Post('apikey')
  @RateLimit({ requestsPerMinute: 15, burstLimit: 10 })
  async createApiKey(
    @Body() body: ProviderOnboardingApiKeyDto,
    @Req() req: ProviderRequest,
  ) {
    return this.onboarding.provisionApiKey(body, this.buildContext(req));
  }

  private buildContext(req: ProviderRequest) {
    return {
      actor: this.formatActor(req.apiKey),
      route: req.originalUrl ?? req.url,
      method: req.method,
      requestId: req.requestId,
    };
  }

  private formatActor(key: AuthenticatedApiKey | undefined) {
    if (!key) {
      return 'unknown';
    }
    return `api-key:${key.id}`;
  }
}

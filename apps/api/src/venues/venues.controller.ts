import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { UpdateVenuePoliciesDto } from './dto/update-venue-policies.dto';
import { UpdateVenueSettingsDto } from './dto/update-venue-settings.dto';
import { VenuesService } from './venues.service';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import type { AuthenticatedApiKey } from '../auth/api-key.service';

type ApiRequest = Request & { apiKey?: AuthenticatedApiKey };

@Controller('v1/venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get(':venueId/settings')
  getSettings(@Param('venueId') venueId: string) {
    return this.venues.getSettings(venueId);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  @Put(':venueId/settings')
  updateSettings(
    @Param('venueId') venueId: string,
    @Body() body: UpdateVenueSettingsDto,
  ) {
    return this.venues.updateSettings(venueId, body);
  }

  @Get(':venueId/policies')
  getPolicies(@Param('venueId') venueId: string) {
    return this.venues.getPolicies(venueId);
  }

  @UseGuards(ApiKeyGuard, RateLimitGuard)
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  @Put(':venueId/policies')
  updatePolicies(
    @Param('venueId') venueId: string,
    @Body() body: UpdateVenuePoliciesDto,
    @Req() req: ApiRequest,
  ) {
    return this.venues.updatePolicies(
      venueId,
      body,
      formatActor(req.apiKey),
    );
  }
}

function formatActor(key: AuthenticatedApiKey | undefined): string {
  if (!key) return 'unknown';
  return `api-key:${key.id}`;
}


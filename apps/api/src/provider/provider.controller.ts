import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheMetricsInterceptor } from '../cache/cache.metrics.interceptor';
import { Roles } from '../common/decorators/roles.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import {
  ProviderUsageKeyTimeseriesQueryDto,
  ProviderUsageKeysQueryDto,
  ProviderUsageTenantsQueryDto,
} from './dto';
import { ProviderUsageCacheInterceptor } from './provider.cache.interceptor';
import { ProviderUsageService } from './provider.service';

@Roles('admin', 'provider')
@UseGuards(RateLimitGuard)
@UseInterceptors(ProviderUsageCacheInterceptor, CacheMetricsInterceptor)
@Controller('v1/provider/usage')
export class ProviderController {
  constructor(private readonly usage: ProviderUsageService) {}

  @Get('keys')
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  async listKeys(@Query() query: ProviderUsageKeysQueryDto) {
    return this.usage.listApiKeyUsage({
      tenantId: query.tenantId,
      from: query.from,
      to: query.to,
    });
  }

  @Get('keys/:apiKeyId/timeseries')
  @RateLimit({ requestsPerMinute: 120, burstLimit: 60 })
  async getKeyTimeseries(
    @Param('apiKeyId') apiKeyId: string,
    @Query() query: ProviderUsageKeyTimeseriesQueryDto,
  ) {
    const days = query.days ?? 30;
    return this.usage.getKeyTimeseries(apiKeyId, days);
  }

  @Get('tenants')
  @RateLimit({ requestsPerMinute: 30, burstLimit: 15 })
  async listTenantUsage(@Query() query: ProviderUsageTenantsQueryDto) {
    return this.usage.listTenantUsage({
      from: query.from,
      to: query.to,
    });
  }
}

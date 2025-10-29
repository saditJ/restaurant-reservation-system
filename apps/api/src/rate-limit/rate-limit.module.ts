import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { MetricsModule } from '../metrics/metrics.module';
import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitUsageService } from './rate-limit-usage.service';

@Module({
  imports: [CacheModule, MetricsModule],
  providers: [RateLimitService, RateLimitGuard, RateLimitUsageService],
  exports: [RateLimitService, RateLimitGuard, RateLimitUsageService],
})
export class RateLimitModule {}

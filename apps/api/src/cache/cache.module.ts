import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { CacheService } from './cache.service';
import { CacheMetricsInterceptor } from './cache.metrics.interceptor';

@Module({
  imports: [MetricsModule],
  providers: [CacheService, CacheMetricsInterceptor],
  exports: [CacheService, CacheMetricsInterceptor],
})
export class CacheModule {}

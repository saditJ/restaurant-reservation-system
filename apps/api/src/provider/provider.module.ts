import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { DatabaseModule } from '../database/database.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { ProviderController } from './provider.controller';
import { ProviderUsageCacheInterceptor } from './provider.cache.interceptor';
import { ProviderUsageService } from './provider.service';
import { ProviderOnboardingController } from './provider-onboarding.controller';
import { ProviderOnboardingService } from './provider-onboarding.service';

@Module({
  imports: [
    CacheModule,
    DatabaseModule,
    forwardRef(() => RateLimitModule),
    AuthModule,
  ],
  controllers: [ProviderController, ProviderOnboardingController],
  providers: [
    ProviderUsageService,
    ProviderUsageCacheInterceptor,
    ProviderOnboardingService,
  ],
})
export class ProviderModule {}

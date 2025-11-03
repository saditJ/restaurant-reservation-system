import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { WaitlistController } from './waitlist.controller';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { HoldsModule } from '../holds.module';
import { MetricsModule } from '../metrics/metrics.module';
import { CommsModule } from '../comms/comms.module';
import { AvailabilityPolicyService } from '../availability/policy.service';

@Module({
  imports: [
    AuthModule,
    RateLimitModule,
    IdempotencyModule,
    HoldsModule,
    MetricsModule,
    CommsModule,
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService, AvailabilityPolicyService],
  exports: [WaitlistService, AvailabilityPolicyService],
})
export class WaitlistModule {}

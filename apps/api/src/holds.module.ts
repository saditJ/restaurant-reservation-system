import { Module } from '@nestjs/common';
import { HoldsService } from './holds.service';
import { HoldsController } from './holds.controller';
import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [AuthModule, RateLimitModule, IdempotencyModule, CacheModule],
  controllers: [HoldsController],
  providers: [HoldsService],
  exports: [HoldsService],
})
export class HoldsModule {}

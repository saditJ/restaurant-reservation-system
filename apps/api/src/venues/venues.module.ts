import { Module } from '@nestjs/common';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { FloorplanController } from './floorplan.controller';
import { FloorplanService } from './floorplan.service';

@Module({
  imports: [AuthModule, RateLimitModule, MetricsModule],
  controllers: [VenuesController, FloorplanController],
  providers: [VenuesService, FloorplanService, PrismaService],
  exports: [VenuesService],
})
export class VenuesModule {}

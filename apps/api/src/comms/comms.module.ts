import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommService } from './comm.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [DatabaseModule, MetricsModule],
  providers: [CommService],
  exports: [CommService],
})
export class CommsModule {}

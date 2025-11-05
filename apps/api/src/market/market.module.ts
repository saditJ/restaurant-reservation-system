import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [MarketController],
  providers: [MarketService, PrismaService],
  exports: [MarketService],
})
export class MarketModule {}

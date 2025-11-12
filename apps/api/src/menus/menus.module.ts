import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { MenusController } from './menus.controller';
import { AdminMenusController } from './admin-menus.controller';
import { MenusService } from './menus.service';

@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [MenusController, AdminMenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}

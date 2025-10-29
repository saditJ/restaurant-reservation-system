import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AdminApiGuard } from './admin-api.guard';

@Module({
  providers: [ApiKeyService, ApiKeyGuard, AdminApiGuard],
  exports: [ApiKeyService, ApiKeyGuard, AdminApiGuard],
})
export class AuthModule {}

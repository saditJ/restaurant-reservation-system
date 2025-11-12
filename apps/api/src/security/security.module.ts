import { Module } from '@nestjs/common';

import { LinkTokenService } from './link-token.service';

@Module({
  providers: [LinkTokenService],
  exports: [LinkTokenService],
})
export class SecurityModule {}

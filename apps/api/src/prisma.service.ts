import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { applyPiiProtections } from './privacy/prisma-pii';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super();
    applyPiiProtections(this);
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Use process.on to avoid the '$on("beforeExit")' typing quirk in some TS setups
  enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}

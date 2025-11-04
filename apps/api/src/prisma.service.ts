import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { applyPiiProtections } from './privacy/prisma-pii';
import { tenantScopeExtension } from './prisma/tenant-middleware';

const ExtendedPrismaClient = PrismaClient.$extends(tenantScopeExtension);

@Injectable()
export class PrismaService extends ExtendedPrismaClient implements OnModuleInit {
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

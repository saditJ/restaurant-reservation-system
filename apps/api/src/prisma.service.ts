import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { applyPiiProtections } from './privacy/prisma-pii';
import { tenantScopeExtension } from './prisma/tenant-middleware';

const shouldSkipPrismaConnect = () =>
  ['1', 'true'].includes(String(process.env.PRISMA_SKIP_CONNECT ?? '').toLowerCase());

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super();
    applyPiiProtections(this); // PATCH 20b.2
    const extended = (this as any).$extends(tenantScopeExtension); // PATCH 20b.2
    Object.assign(this as any, extended); // PATCH 20b.2
  }

  async onModuleInit() {
    if (shouldSkipPrismaConnect()) {
      return;
    }
    await this.$connect(); // PATCH 20b.2
  }

  // Use process.on to avoid the '$on("beforeExit")' typing quirk in some TS setups
  enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}

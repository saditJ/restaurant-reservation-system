import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantScopeExtension } from './prisma/tenant-middleware';
import { piiExtension } from './prisma/pii.extension';

const shouldSkipPrismaConnect = () =>
  ['1', 'true'].includes(
    String(process.env.PRISMA_SKIP_CONNECT ?? '').toLowerCase(),
  );

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super();
    // Apply extensions: piiExtension first, then tenant scoping
    // Order matters: PII encryption should happen before tenant filtering
    const withPii = (this as any).$extends(piiExtension);
    const withTenant = withPii.$extends(tenantScopeExtension);
    Object.assign(this as any, withTenant);
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

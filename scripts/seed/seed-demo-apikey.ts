// scripts/seed/seed-demo-apikey.ts
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
  if (!demo) throw new Error("Demo Tenant (slug='demo') not found");

  // Use env for the plaintext; fallback for local dev
  const plaintext = process.env.DEMO_TENANT_API_KEY || 'demo-tenant-key';
  const hashed = createHash('sha256').update(plaintext).digest('hex');

  // Upsert on a fixed id to be idempotent (String id allows overriding default cuid)
  await prisma.apiKey.upsert({
    where: { id: 'dev-demo-key' },
    update: {
      name: 'dev-demo',
      hashedKey: hashed,
      isActive: true,
      rateLimitPerMin: 600,
      burstLimit: 60,
      scopeJSON: {},
      tenantId: demo.id,
    },
    create: {
      id: 'dev-demo-key',
      name: 'dev-demo',
      hashedKey: hashed,
      isActive: true,
      rateLimitPerMin: 600,
      burstLimit: 60,
      scopeJSON: {},
      tenantId: demo.id,
    },
  });

  console.log('✅ Seeded dev API key for Demo tenant. Use plaintext:', plaintext);
}

main().finally(() => prisma.$disconnect());

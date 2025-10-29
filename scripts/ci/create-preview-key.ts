import process from 'node:process';
import { PrismaService } from '../../apps/api/src/prisma.service';
import { ApiKeyService } from '../../apps/api/src/auth/api-key.service';

function resolveName(): string {
  const args = process.argv.slice(2);
  const nameIndex = args.findIndex((arg) => arg === '--name');
  if (nameIndex !== -1 && args[nameIndex + 1]) {
    return args[nameIndex + 1];
  }
  const fallback =
    process.env.PREVIEW_KEY_NAME ??
    `Preview Key ${new Date().toISOString().slice(0, 19)}`;
  return fallback;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const apiKeys = new ApiKeyService(prisma);

  try {
    const name = resolveName();
    const { key, plaintext } = await apiKeys.createKey({
      name,
      rateLimitPerMin: 600,
      burstLimit: 600,
      scopes: ['default', 'admin'],
    });
    console.log(
      JSON.stringify(
        {
          id: key.id,
          name: key.name,
          plaintext,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to create preview API key', error);
  process.exitCode = 1;
});

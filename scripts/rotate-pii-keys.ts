#!/usr/bin/env tsx
/**
 * PII Key Rotation Script
 * 
 * Re-encrypts PII fields with the current key version.
 * Use this after changing PII_KEY_VERSION to migrate old records.
 * 
 * Usage:
 *   pnpm rotate:pii [--dry-run] [--batch-size=100] [--model=Reservation]
 * 
 * Examples:
 *   pnpm rotate:pii --dry-run              # Preview changes
 *   pnpm rotate:pii --model=User           # Rotate User records only
 *   pnpm rotate:pii --batch-size=500       # Process 500 records at a time
 */

import { PrismaClient } from '@prisma/client';
import {
  encryptPii,
  decryptPii,
  getActivePiiKeyVersion,
  deriveEmailSearch,
  derivePhoneSearch,
  derivePhoneLast4,
} from '../apps/api/src/privacy/pii-crypto';

type RotationConfig = {
  model: 'User' | 'Reservation' | 'Waitlist';
  fields: string[];
  keyVersionField?: string;
  searchFields?: Record<string, string>;
  derivedFields?: Record<string, string>;
};

const ROTATION_CONFIGS: RotationConfig[] = [
  {
    model: 'User',
    fields: ['emailEnc', 'nameEnc'],
  },
  {
    model: 'Reservation',
    fields: ['guestName', 'guestEmail', 'guestPhone'],
    keyVersionField: 'piiKeyVersion',
    searchFields: {
      guestEmail: 'guestEmailSearch',
      guestPhone: 'guestPhoneSearch',
    },
    derivedFields: {
      guestPhone: 'guestPhoneLast4',
    },
  },
  {
    model: 'Waitlist',
    fields: ['name', 'emailEnc', 'phoneEnc'],
  },
];

interface RotationOptions {
  dryRun: boolean;
  batchSize: number;
  model?: string;
}

function parseArgs(): RotationOptions {
  const args = process.argv.slice(2);
  const options: RotationOptions = {
    dryRun: false,
    batchSize: 100,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--model=')) {
      options.model = arg.split('=')[1];
    }
  }

  return options;
}

async function rotateModel(
  prisma: PrismaClient,
  config: RotationConfig,
  options: RotationOptions,
): Promise<{ processed: number; updated: number; errors: number }> {
  console.log(`\n🔄 Processing ${config.model}...`);

  const currentVersion = getActivePiiKeyVersion();
  const modelClient = (prisma as any)[config.model.toLowerCase()];
  
  if (!modelClient) {
    console.error(`❌ Model ${config.model} not found in Prisma client`);
    return { processed: 0, updated: 0, errors: 0 };
  }

  // Build WHERE clause to find records that need rotation
  const whereClause: any = {};
  if (config.keyVersionField) {
    whereClause.OR = [
      { [config.keyVersionField]: null },
      { [config.keyVersionField]: { not: currentVersion } },
    ];
  }

  // Count total records
  const total = await modelClient.count({ where: whereClause });
  console.log(`  Found ${total} records to process`);

  if (total === 0) {
    console.log(`  ✅ All records already use version ${currentVersion}`);
    return { processed: 0, updated: 0, errors: 0 };
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let skip = 0;

  while (skip < total) {
    const batch = await modelClient.findMany({
      where: whereClause,
      take: options.batchSize,
      skip,
    });

    console.log(`  Processing batch ${Math.floor(skip / options.batchSize) + 1}...`);

    for (const record of batch) {
      try {
        const updates: any = {};
        let hasChanges = false;

        // Decrypt and re-encrypt each field
        for (const fieldName of config.fields) {
          const encrypted = record[fieldName];
          if (typeof encrypted === 'string' && encrypted) {
            try {
              const decrypted = decryptPii(encrypted, record[config.keyVersionField!]);
              if (decrypted) {
                const { ciphertext } = encryptPii(decrypted);
                updates[fieldName] = ciphertext;
                hasChanges = true;

                // Update searchable fields
                if (config.searchFields?.[fieldName]) {
                  if (fieldName.toLowerCase().includes('email')) {
                    updates[config.searchFields[fieldName]] = deriveEmailSearch(decrypted);
                  } else if (fieldName.toLowerCase().includes('phone')) {
                    const { hash } = derivePhoneSearch(decrypted);
                    updates[config.searchFields[fieldName]] = hash;
                  }
                }

                // Update derived fields
                if (config.derivedFields?.[fieldName]) {
                  if (fieldName.toLowerCase().includes('phone')) {
                    updates[config.derivedFields[fieldName]] = derivePhoneLast4(decrypted);
                  }
                }
              }
            } catch (error) {
              console.error(`    ⚠️  Failed to decrypt ${fieldName} for record ${record.id}`);
            }
          }
        }

        // Update key version
        if (config.keyVersionField && hasChanges) {
          updates[config.keyVersionField] = currentVersion;
        }

        if (hasChanges) {
          if (!options.dryRun) {
            await modelClient.update({
              where: { id: record.id },
              data: updates,
            });
          }
          updated++;
        }

        processed++;
      } catch (error) {
        errors++;
        console.error(`    ❌ Error processing record ${record.id}:`, error);
      }
    }

    skip += options.batchSize;
  }

  console.log(`  ✅ Processed: ${processed}, Updated: ${updated}, Errors: ${errors}`);
  return { processed, updated, errors };
}

async function main() {
  const options = parseArgs();

  console.log('🔐 PII Key Rotation Script');
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Batch Size: ${options.batchSize}`);
  console.log(`   Target Version: ${getActivePiiKeyVersion()}`);
  if (options.model) {
    console.log(`   Model Filter: ${options.model}`);
  }

  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    const configs = options.model
      ? ROTATION_CONFIGS.filter((c) => c.model === options.model)
      : ROTATION_CONFIGS;

    if (configs.length === 0) {
      console.error(`❌ Unknown model: ${options.model}`);
      process.exit(1);
    }

    for (const config of configs) {
      const result = await rotateModel(prisma, config, options);
      totalProcessed += result.processed;
      totalUpdated += result.updated;
      totalErrors += result.errors;
    }

    console.log('\n📊 Summary:');
    console.log(`   Total Processed: ${totalProcessed}`);
    console.log(`   Total Updated: ${totalUpdated}`);
    console.log(`   Total Errors: ${totalErrors}`);

    if (options.dryRun) {
      console.log('\n💡 Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Rotation complete!');
    }
  } catch (error) {
    console.error('\n❌ Rotation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

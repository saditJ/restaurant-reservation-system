/**
 * Transparent PII encryption extension for Prisma.
 * Automatically encrypts/decrypts sensitive fields on write/read operations.
 * 
 * Supports key rotation via PII_KEY_VERSION environment variable.
 */
import { Prisma } from '@prisma/client';
import {
  encryptPii,
  decryptPii,
  getActivePiiKeyVersion,
  deriveEmailSearch,
  derivePhoneSearch,
  derivePhoneLast4,
} from '../privacy/pii-crypto';

/**
 * Configuration for fields that need encryption.
 * Maps model name -> field names that should be encrypted.
 */
const PII_FIELD_CONFIG = {
  User: {
    encrypted: ['emailEnc', 'nameEnc'],
    searchable: {},
  },
  Reservation: {
    encrypted: ['guestName', 'guestEmail', 'guestPhone'],
    searchable: {
      guestEmail: 'guestEmailSearch',
      guestPhone: 'guestPhoneSearch',
    },
    derived: {
      guestPhone: 'guestPhoneLast4',
    },
  },
  Waitlist: {
    encrypted: ['name', 'emailEnc', 'phoneEnc'],
    searchable: {},
  },
} as const;

type ModelName = keyof typeof PII_FIELD_CONFIG;
type FieldConfig = (typeof PII_FIELD_CONFIG)[ModelName];

/**
 * Check if a value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Encrypt PII fields in a data payload before writing to database.
 */
function encryptFields(
  modelName: ModelName,
  data: Record<string, unknown>,
  keyVersion: string,
): void {
  const config = PII_FIELD_CONFIG[modelName];
  if (!config) return;

  const { encrypted, searchable } = config;
  const derived = 'derived' in config ? config.derived : undefined;

  // Encrypt each configured field
  for (const fieldName of encrypted) {
    const value = data[fieldName];
    if (typeof value === 'string' && value.trim()) {
      const { ciphertext } = encryptPii(value);
      data[fieldName] = ciphertext;

      // Derive searchable fields if configured
      const searchField = (searchable as Record<string, string>)[fieldName];
      if (searchField) {
        if (fieldName.toLowerCase().includes('email')) {
          data[searchField] = deriveEmailSearch(value);
        } else if (fieldName.toLowerCase().includes('phone')) {
          const { hash } = derivePhoneSearch(value);
          data[searchField] = hash;
        }
      }

      // Derive other fields (e.g., last4)
      const derivedField = derived
        ? (derived as Record<string, string>)[fieldName]
        : undefined;
      if (derivedField && fieldName.toLowerCase().includes('phone')) {
        data[derivedField] = derivePhoneLast4(value);
      }
    }
  }

  // Set key version if the model supports it
  if ('piiKeyVersion' in data || modelName === 'Reservation') {
    data.piiKeyVersion = keyVersion;
  }
}

/**
 * Decrypt PII fields in a result after reading from database.
 */
function decryptFields(
  modelName: ModelName,
  record: Record<string, unknown>,
): void {
  const config = PII_FIELD_CONFIG[modelName];
  if (!config) return;

  const keyVersion =
    typeof record.piiKeyVersion === 'string' ? record.piiKeyVersion : undefined;

  for (const fieldName of config.encrypted) {
    const value = record[fieldName];
    if (typeof value === 'string') {
      const decrypted = decryptPii(value, keyVersion);
      if (decrypted !== null) {
        record[fieldName] = decrypted;
      }
    }
  }
}

/**
 * Recursively process nested write operations (create, update, connect, etc.)
 */
function processNestedWrites(
  data: unknown,
  keyVersion: string,
  processedSet = new WeakSet(),
): void {
  if (!isPlainObject(data)) return;
  if (processedSet.has(data)) return;
  processedSet.add(data);

  // Check if this is a model-specific nested operation
  for (const modelName of Object.keys(PII_FIELD_CONFIG) as ModelName[]) {
    const nestedOp = data[modelName];
    if (isPlainObject(nestedOp)) {
      // Handle create/createMany
      if (isPlainObject(nestedOp.create)) {
        encryptFields(modelName, nestedOp.create, keyVersion);
        processNestedWrites(nestedOp.create, keyVersion, processedSet);
      }
      const createMany = nestedOp.createMany as any;
      if (createMany && Array.isArray(createMany.data)) {
        for (const item of createMany.data) {
          if (isPlainObject(item)) {
            encryptFields(modelName, item, keyVersion);
            processNestedWrites(item, keyVersion, processedSet);
          }
        }
      }

      // Handle update/updateMany
      if (isPlainObject(nestedOp.update)) {
        const updateObj = nestedOp.update as any;
        const updateData = updateObj.data ?? updateObj;
        if (isPlainObject(updateData)) {
          encryptFields(modelName, updateData, keyVersion);
          processNestedWrites(updateData, keyVersion, processedSet);
        }
      }
      if (isPlainObject(nestedOp.updateMany)) {
        const updateManyObj = nestedOp.updateMany as any;
        const updateData = updateManyObj.data;
        if (isPlainObject(updateData)) {
          encryptFields(modelName, updateData, keyVersion);
        }
      }

      // Handle upsert
      if (isPlainObject(nestedOp.upsert)) {
        const upsertObj = nestedOp.upsert as any;
        if (isPlainObject(upsertObj.create)) {
          encryptFields(modelName, upsertObj.create, keyVersion);
          processNestedWrites(upsertObj.create, keyVersion, processedSet);
        }
        if (isPlainObject(upsertObj.update)) {
          const updateData = upsertObj.update.data ?? upsertObj.update;
          if (isPlainObject(updateData)) {
            encryptFields(modelName, updateData, keyVersion);
            processNestedWrites(updateData, keyVersion, processedSet);
          }
        }
      }
    }
  }

  // Recursively process all nested objects
  for (const value of Object.values(data)) {
    if (isPlainObject(value)) {
      processNestedWrites(value, keyVersion, processedSet);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        processNestedWrites(item, keyVersion, processedSet);
      }
    }
  }
}

/**
 * Recursively decrypt results (single record, array, or nested relations)
 */
function decryptResults(
  result: unknown,
  processedSet = new WeakSet(),
): unknown {
  if (!result) return result;

  // Handle arrays
  if (Array.isArray(result)) {
    return result.map((item) => decryptResults(item, processedSet));
  }

  // Handle plain objects
  if (!isPlainObject(result)) return result;
  if (processedSet.has(result)) return result;
  processedSet.add(result);

  // Try to decrypt if this looks like a model record
  for (const modelName of Object.keys(PII_FIELD_CONFIG) as ModelName[]) {
    // Simple heuristic: if it has 'id' and is not already processed
    if ('id' in result && typeof result.id === 'string') {
      decryptFields(modelName, result);
      break; // Only decrypt once per record
    }
  }

  // Recursively process nested relations
  for (const [key, value] of Object.entries(result)) {
    if (isPlainObject(value) || Array.isArray(value)) {
      result[key] = decryptResults(value, processedSet);
    }
  }

  return result;
}

/**
 * Prisma extension for transparent PII encryption/decryption.
 */
export const piiExtension = Prisma.defineExtension({
  name: 'pii-encryption',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const modelName = model as string;
        
        // Only process configured models
        if (!PII_FIELD_CONFIG[modelName as ModelName]) {
          return query(args);
        }

        const keyVersion = getActivePiiKeyVersion();
        const isWrite = ['create', 'createMany', 'update', 'updateMany', 'upsert'].includes(
          operation,
        );

        // Encrypt fields on write operations
        if (isWrite && args && isPlainObject(args)) {
          // Handle direct data field
          if (isPlainObject((args as any).data)) {
            encryptFields(modelName as ModelName, (args as any).data, keyVersion);
          }

          // Handle array of data (createMany)
          if (Array.isArray((args as any).data)) {
            for (const item of (args as any).data) {
              if (isPlainObject(item)) {
                encryptFields(modelName as ModelName, item, keyVersion);
              }
            }
          }

          // Process nested writes (relations)
          processNestedWrites(args, keyVersion);
        }

        // Execute the query
        const result = await query(args);

        // Decrypt results on read operations
        const isRead = [
          'findFirst',
          'findFirstOrThrow',
          'findMany',
          'findUnique',
          'findUniqueOrThrow',
          'create',
          'createMany',
          'update',
          'updateMany',
          'upsert',
        ].includes(operation);

        if (isRead && result) {
          return decryptResults(result);
        }

        return result;
      },
    },
  },
});

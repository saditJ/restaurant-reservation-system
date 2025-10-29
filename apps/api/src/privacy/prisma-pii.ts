import { Prisma, PrismaClient } from '@prisma/client';
import {
  decryptPii,
  deriveEmailSearch,
  derivePhoneSearch,
  encryptPii,
  getActivePiiKeyVersion,
} from './pii-crypto';

const MUTATION_ACTIONS = new Set<Prisma.PrismaAction>([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);

const READ_ACTIONS = new Set<Prisma.PrismaAction>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'upsert',
  'create',
  'createMany',
  'aggregate',
  'groupBy',
  'delete',
  'deleteMany',
  'count',
]);

type MiddlewareContext = {
  action: Prisma.PrismaAction;
  model?: string | null;
  args?: Record<string, unknown>;
};

const withPiiExtension = Prisma.defineExtension({
  name: 'pii-protections',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const action = operation as Prisma.PrismaAction;

        const context: MiddlewareContext = {
          action,
          model: typeof model === 'string' ? model : undefined,
          args: isRecord(args) ? args : undefined,
        };

        if (context.args && MUTATION_ACTIONS.has(action)) {
          scrubReservationWrites(context);
        }

        const result = await query(args);

        if (!READ_ACTIONS.has(action)) {
          return result;
        }

        return decryptReservationResult(result);
      },
    },
  },
});

export function applyPiiProtections<TClient extends PrismaClient>(
  client: TClient,
): TClient {
  const extended = client.$extends(withPiiExtension) as TClient;
  Object.assign(client, extended);
  return client;
}

export function createPrismaWithPii(
  options?: Prisma.PrismaClientOptions,
): PrismaClient {
  const client = new PrismaClient(options);
  return applyPiiProtections(client);
}

function scrubReservationWrites(params: MiddlewareContext) {
  if (!params.args) return;
  if (params.model === 'Reservation') {
    mutateReservationPayload(params.args);
    return;
  }

  traverseNestedWrites(params.args, (payload) => {
    if (payload?.model === 'Reservation' && payload.data) {
      mutateReservationPayload({ data: payload.data });
    }
  });
}

function mutateReservationPayload(args: Record<string, unknown>) {
  if (!args) return;
  if ('data' in args && args.data) {
    if (Array.isArray(args.data)) {
      args.data.forEach((record) => encryptReservationRecord(record));
    } else {
      encryptReservationRecord(args.data as Record<string, unknown>);
    }
  }
  if ('create' in args && args.create) {
    if (Array.isArray(args.create)) {
      args.create.forEach((record) => encryptReservationRecord(record));
    } else {
      encryptReservationRecord(args.create as Record<string, unknown>);
    }
  }
  if ('update' in args && args.update) {
    if (Array.isArray(args.update)) {
      args.update.forEach((record) => encryptReservationRecord(record));
    } else {
      encryptReservationRecord(args.update as Record<string, unknown>);
    }
  }
}

function encryptReservationRecord(input: unknown) {
  if (!input || typeof input !== 'object') return;
  const record = input as Record<string, unknown>;
  let shouldAssignKeyVersion = false;

  if ('guestEmail' in record) {
    const raw = record.guestEmail;
    if (raw !== undefined) {
      if (raw === null) {
        record.guestEmail = null;
        record.guestEmailSearch = null;
      } else {
        const normalized = String(raw).trim();
        if (!normalized) {
          record.guestEmail = null;
          record.guestEmailSearch = null;
        } else {
          const encrypted = encryptPii(normalized);
          record.guestEmail = encrypted.ciphertext;
          record.guestEmailSearch = deriveEmailSearch(normalized);
          shouldAssignKeyVersion = true;
        }
      }
    }
  }

  if ('guestPhone' in record) {
    const raw = record.guestPhone;
    if (raw !== undefined) {
      if (raw === null) {
        record.guestPhone = null;
        record.guestPhoneSearch = null;
        record.guestPhoneLast4 = null;
      } else {
        const normalized = String(raw).trim();
        if (!normalized) {
          record.guestPhone = null;
          record.guestPhoneSearch = null;
          record.guestPhoneLast4 = null;
        } else {
          const encrypted = encryptPii(normalized);
          record.guestPhone = encrypted.ciphertext;
          const search = derivePhoneSearch(normalized);
          record.guestPhoneSearch = search.hash;
          record.guestPhoneLast4 = search.last4;
          shouldAssignKeyVersion = true;
        }
      }
    }
  }

  if (shouldAssignKeyVersion) {
    record.piiKeyVersion = getActivePiiKeyVersion();
  }
}

function decryptReservationResult<T>(result: T): T {
  if (!result) return result;
  if (Array.isArray(result)) {
    result.forEach((item) => decryptReservationResult(item));
    return result;
  }
  if (typeof result !== 'object') {
    return result;
  }

  const seen = new WeakSet<object>();
  traverse(result as Record<string, unknown>, seen);
  return result;
}

function traverse(value: Record<string, unknown>, seen: WeakSet<object>) {
  if (seen.has(value)) return;
  seen.add(value);

  maybeDecryptReservation(value);

  for (const entry of Object.values(value)) {
    if (!entry || typeof entry !== 'object') continue;
    if (Array.isArray(entry)) {
      entry.forEach((child) => {
        if (child && typeof child === 'object') {
          traverse(child as Record<string, unknown>, seen);
        }
      });
      continue;
    }
    traverse(entry as Record<string, unknown>, seen);
  }
}

function maybeDecryptReservation(value: Record<string, unknown>) {
  if (!('guestEmail' in value) && !('guestPhone' in value)) return;

  const version = typeof value.piiKeyVersion === 'string' ? value.piiKeyVersion : null;

  if (typeof value.guestEmail === 'string') {
    value.guestEmail = decryptPii(value.guestEmail, version);
  } else if (value.guestEmail === null) {
    value.guestEmail = null;
  }

  if (typeof value.guestPhone === 'string') {
    value.guestPhone = decryptPii(value.guestPhone, version);
  } else if (value.guestPhone === null) {
    value.guestPhone = null;
  }
}

type NestedWritePayload = {
  model: string;
  data?: unknown;
};

function traverseNestedWrites(
  value: unknown,
  visitor: (payload: NestedWritePayload) => void,
) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => traverseNestedWrites(entry, visitor));
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (
    typeof record.model === 'string' &&
    Object.prototype.hasOwnProperty.call(record, 'data')
  ) {
    visitor(record as NestedWritePayload);
  }

  for (const entry of Object.values(record)) {
    traverseNestedWrites(entry, visitor);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

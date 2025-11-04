import { Prisma } from '@prisma/client';
import { RequestContext } from '../common/request-context';

const TENANTED = new Set<string>([
  'Table',
  'Reservation',
  'Shift',
  'ServiceArea',
  'MenuItem',
  'Blackout',
  'FloorPlan',
  // extend as needed
]);

function withTenantWhere(
  args: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  const where = {
    ...(((args.where as Record<string, unknown> | undefined) ?? {})),
  };
  where.tenantId = tenantId;
  return { ...args, where };
}

export const tenantScopeExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANTED.has(model)) {
          return query(args);
        }

        const tenantId = RequestContext.tenantId;
        if (!tenantId) {
          return query(args);
        }

        const op = operation.toString();
        const currentArgs = (args ?? {}) as Record<string, unknown>;
        const nextArgs: Record<string, unknown> = { ...currentArgs };

        if (op === 'findMany' || op === 'count' || op === 'aggregate') {
          const scopedArgs = withTenantWhere(nextArgs, tenantId) as typeof args;
          return query(scopedArgs);
        }

        if (op === 'findFirst' || op === 'findFirstOrThrow') {
          const scopedArgs = withTenantWhere(nextArgs, tenantId) as typeof args;
          return query(scopedArgs);
        }

        if (op === 'create') {
          const data = {
            ...((nextArgs.data as Record<string, unknown> | undefined) ?? {}),
            tenantId,
          };
          nextArgs.data = data;
          return query(nextArgs as typeof args);
        }

        if (
          op === 'update' ||
          op === 'updateMany' ||
          op === 'delete' ||
          op === 'deleteMany'
        ) {
          const scopedArgs = withTenantWhere(nextArgs, tenantId) as typeof args;
          return query(scopedArgs);
        }

        return query(nextArgs as typeof args);
      },
    },
  },
});

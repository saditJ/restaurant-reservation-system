import type { Prisma } from '@prisma/client';

function normalizeTableIds(input: string[]) {
  return Array.from(
    new Set(
      input.filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      ),
    ),
  );
}

export async function syncReservationTableAssignments(
  tx: Prisma.TransactionClient,
  reservationId: string,
  tableIds: string[],
) {
  const normalized = normalizeTableIds(tableIds);
  const existing = await tx.reservationTableAssignment.findMany({
    where: { reservationId },
    select: { tableId: true },
  });
  const toRemove = existing
    .filter((item) => !normalized.includes(item.tableId))
    .map((item) => item.tableId);
  if (toRemove.length > 0) {
    await tx.reservationTableAssignment.deleteMany({
      where: {
        reservationId,
        tableId: { in: toRemove },
      },
    });
  }
  for (let index = 0; index < normalized.length; index += 1) {
    const tableId = normalized[index];
    await tx.reservationTableAssignment.upsert({
      where: { reservationId_tableId: { reservationId, tableId } },
      update: { assignedOrder: index },
      create: { reservationId, tableId, assignedOrder: index },
    });
  }
}

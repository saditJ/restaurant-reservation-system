process.env.PII_SECRET =
  process.env.PII_SECRET ?? '0123456789abcdef0123456789abcdef';
process.env.PII_KEY_VERSION = process.env.PII_KEY_VERSION ?? 'v1';

// Ensure Prisma enum exports are available during isolated tests.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prisma = require('@prisma/client');

  const ensureEnum = (name: string, value: Record<string, string>) => {
    if (!prisma[name]) {
      Object.defineProperty(prisma, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    }
  };

  ensureEnum('ReservationStatus', {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    SEATED: 'SEATED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  });

  ensureEnum('HoldStatus', {
    HELD: 'HELD',
    CONSUMED: 'CONSUMED',
    EXPIRED: 'EXPIRED',
  });

  ensureEnum('NotificationOutboxStatus', {
    PENDING: 'PENDING',
    SENT: 'SENT',
    FAILED: 'FAILED',
  });
} catch {
  // ignore if prisma client is not available in this environment
}

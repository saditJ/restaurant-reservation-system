if (!process.env.PII_SECRET) {
  // New Base64 key that resolves to 32 bytes of binary data
  process.env.PII_SECRET = 'MzIteW91ci1yYW5kb20tc2VjcmV0LWZvci1jaS10ZXN0cw==';
}
if (!process.env.PII_KEY_VERSION) {
  process.env.PII_KEY_VERSION = 'v1';
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prisma = require('@prisma/client');

  const ensureEnum = (name, values) => {
    if (!prisma[name]) {
      Object.defineProperty(prisma, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: values,
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
  // ignore when prisma client is unavailable
}

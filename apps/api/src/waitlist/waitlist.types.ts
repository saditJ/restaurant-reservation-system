export const WAITLIST_STATUSES = [
  'WAITING',
  'OFFERED',
  'EXPIRED',
  'CONVERTED',
] as const;

export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

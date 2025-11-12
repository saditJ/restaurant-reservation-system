import type { ReservationStatus } from '@/lib/types';

export const DEFAULT_PAGE_SIZE = 25;

export const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly ReservationStatus[];

export const STATUS_FILTERS = [
  'ALL',
  'ACTIVE',
  ...STATUSES,
] as const;

export const SORT_FIELDS = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'guest', label: 'Guest' },
  { key: 'status', label: 'Status' },
  { key: 'table', label: 'Table' },
] as const;

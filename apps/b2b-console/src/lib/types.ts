export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED';

export type HoldStatus = 'HELD' | 'CONSUMED' | 'EXPIRED';

export type ReservationConflictReservation = {
  id: string;
  code: string;
  status: ReservationStatus;
  tableId: string | null;
  tableIds?: string[];
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  durationMinutes: number | null;
};

export type ReservationConflictHold = {
  id: string;
  status: HoldStatus;
  tableId: string | null;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  expiresAt: string;
};

export type ReservationConflict = {
  reservations: ReservationConflictReservation[];
  holds: ReservationConflictHold[];
};

export type ReservationHoldSummary = {
  id: string;
  status: HoldStatus;
  tableId: string | null;
  tableLabel: string | null;
  tableArea: string | null;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  partySize: number;
};

export type ReservationTable = {
  tableId: string;
  label: string | null;
  capacity: number | null;
  area: string | null;
  zone: string | null;
  joinGroupId: string | null;
  order: number;
};

export type Reservation = {
  id: string;
  venueId: string;
  code: string;
  status: ReservationStatus;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  slotLocalDate: string;
  slotLocalTime: string;
  slotStartUtc: string;
  durationMinutes: number;
  tableId: string | null;
  tableLabel: string | null;
  tableArea: string | null;
  tableCapacity: number | null;
  tables?: ReservationTable[];
  notes: string | null;
  channel: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  hold: ReservationHoldSummary | null;
  conflicts: ReservationConflict;
};

export type ReservationListResponse = {
  items: Reservation[];
  total: number;
};

export type Hold = {
  id: string;
  status: HoldStatus;
  expiresAt: string;
  venueId: string;
  booking: {
    date: string;
    time: string;
    partySize: number;
    party: number;
    tableId: string | null;
    tableLabel: string | null;
  };
};

export type AvailabilityTable = {
  id: string;
  label: string;
  capacity: number;
  area?: string | null;
  zone?: string | null;
  joinGroupId?: string | null;
};

export type AvailabilityResponse = {
  requested: {
    venueId: string;
    date: string;
    time: string;
    partySize: number;
    durationMinutes: number;
  };
  tables: AvailabilityTable[];
  stats: {
    total: number;
    available: number;
    blocked: number;
  };
  conflicts: ReservationConflict;
};

export type VenueHours = Record<string, Array<{ start: string; end: string }>>;

export type VenueSettings = {
  venueId: string;
  timezone: string;
  hours: VenueHours | null;
  turnTimeMin: number;
  holdTtlMin: number;
  defaultDurationMin: number;
};

export type VenuePolicies = {
  venueId: string;
  cancellationWindowMin: number;
  guestCanModifyUntilMin: number;
  noShowFeePolicy: boolean;
  retainPersonalDataDays: number;
};

export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  resource: string;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type AuditLogListResponse = {
  total: number;
  items: AuditLogEntry[];
};

export type SeatingSuggestionTable = {
  tableId: string;
  label: string | null;
  capacity: number;
  area: string | null;
  zone: string | null;
  joinGroupId: string | null;
  wear: number;
  order: number;
};

export type SeatingSuggestion = {
  tableIds: string[];
  tables: SeatingSuggestionTable[];
  totalCapacity: number;
  splitCount: number;
  excessCapacity: number;
  wear: {
    total: number;
    max: number;
  };
  score: number;
  explanation: string;
};

export type SeatingSuggestionsResponse = {
  reservationId: string;
  partySize: number;
  slot: {
    date: string;
    time: string;
  };
  generatedAt: string;
  suggestions: SeatingSuggestion[];
};

export type NotificationOutboxStatus = 'PENDING' | 'SENT' | 'FAILED';

export type NotificationOutboxEntry = {
  id: string;
  type: string;
  status: NotificationOutboxStatus;
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
  guestContact: string | null;
  event: 'created' | 'confirmed' | 'modified' | 'cancelled' | 'reminder';
  channel: 'email' | 'sms';
  language: string | null;
  reservation: {
    id: string | null;
    code: string | null;
    status: ReservationStatus | null;
    guestName: string | null;
    slotLocalDate: string | null;
    slotLocalTime: string | null;
    venueName: string | null;
  };
};

export type NotificationOutboxListResponse = {
  items: NotificationOutboxEntry[];
  total: number;
};

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'EXPIRED' | 'CONVERTED';

export type WaitlistEntry = {
  id: string;
  venueId: string;
  venueName: string;
  venueTimezone: string;
  name: string;
  email: string | null;
  phone: string | null;
  partySize: number;
  desiredAt: string;
  notes: string | null;
  priority: number;
  status: WaitlistStatus;
  offerCode: string | null;
  offerToken: string | null;
  holdId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  hold: null | {
    id: string;
    status: HoldStatus;
    slotLocalDate: string;
    slotLocalTime: string;
    slotStartUtc: string;
    expiresAt: string;
  };
};

export type WaitlistListResponse = {
  items: WaitlistEntry[];
  total: number;
};

export type WaitlistOfferSummary = {
  id: string;
  waitlistId: string;
  holdId: string | null;
  offerCode: string | null;
  guestName: string;
  guestEmail: string | null;
  venueId: string | null;
  venueName: string | null;
  status: WaitlistStatus | null;
  sentAt: string;
  expiresAt: string | null;
};

export type VenueSettings = {
  venueId: string;
  name: string;
  city: string | null;
  timezone: string;
  turnTimeMin: number;
  defaultDurationMin: number;
  holdTtlMin: number;
  phone: string | null;
  website: string | null;
};

export type ShiftSummary = {
  id: string;
  venueId: string;
  dow: number;
  startsAt: string;
  endsAt: string;
  capacitySeats: number;
  capacityCovers: number;
  isActive: boolean;
  updatedAt: string;
};

export type ShiftListResponse = {
  items: ShiftSummary[];
};

export type MenuItem = {
  id: string;
  name: string;
  short: string | null;
  price: number;
  currency: 'ALL' | 'EUR';
  isAvailable: boolean;
  imageUrl: string | null;
  tags: string[];
  position: number;
};

export type MenuSection = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  items: MenuItem[];
};

export type AuditLogEntry = {
  ts: string;
  actor: string;
  route: string | null;
  method: string | null;
  status: number | null;
  requestId: string | null;
  tenantId: string | null;
};

export type AuditLogResponse = {
  items: AuditLogEntry[];
  total: number;
};

export type PrivacyExportResponse = {
  generatedAt: string;
  guest: {
    email: string;
    reservations: Array<{
      id: string;
      code: string;
      status: string;
    }>;
  };
};

export type PrivacyEraseResponse = {
  email: string;
  processed: number;
  anonymized: Array<{
    id: string;
    anonymizedAt: string;
    tokenTail: string | null;
  }>;
  skipped: Array<{
    id: string;
    reason: string;
  }>;
};

export type FloorplanRoom = {
  w: number;
  h: number;
  grid: number;
};

export type FloorplanTable = {
  id: string;
  name: string;
  min: number;
  max: number;
  x: number;
  y: number;
  angle: number;
  shape: 'rect' | 'circle' | 'booth';
  w: number;
  h: number;
  zone: string | null;
};

export type FloorplanResponse = {
  room: FloorplanRoom;
  tables: FloorplanTable[];
};

export type FloorplanOccupancy = {
  busyTableIds: string[];
  holdsTableIds: string[];
};



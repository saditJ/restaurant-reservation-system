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

export type AvailabilityTable = {
  id: string;
  label: string;
  capacity: number;
  area?: string | null;
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
};

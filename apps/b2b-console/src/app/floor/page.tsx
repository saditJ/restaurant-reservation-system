import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import FloorClient from './FloorClient';
import { GET } from '@/lib/api';
import { VENUE_TZ } from '@/lib/time';
import type { AvailabilityResponse, Reservation, ReservationListResponse } from '@/lib/types';

const DEFAULT_PARTY_SIZE = 2;
const DEFAULT_LIMIT = 400;

function nowInVenue() {
  const zoned = toZonedTime(new Date(), VENUE_TZ);
  return {
    date: format(zoned, 'yyyy-MM-dd'),
    time: format(zoned, 'HH:mm'),
  };
}

export default async function FloorPage() {
  const { date, time } = nowInVenue();
  const venueId = process.env.NEXT_PUBLIC_VENUE_ID?.trim() || null;

  const availabilityParams = new URLSearchParams();
  availabilityParams.set('date', date);
  availabilityParams.set('time', time);
  availabilityParams.set('partySize', String(DEFAULT_PARTY_SIZE));
  if (venueId) availabilityParams.set('venueId', venueId);

  let initialAvailability: AvailabilityResponse | null = null;
  try {
    initialAvailability = await GET<AvailabilityResponse>(`/availability?${availabilityParams.toString()}`);
  } catch (error) {
    console.error('[floor] failed to preload availability', error);
  }

  const reservationsParams = new URLSearchParams();
  reservationsParams.set('date', date);
  reservationsParams.set('limit', String(DEFAULT_LIMIT));
  reservationsParams.set('offset', '0');
  reservationsParams.set('includeConflicts', '1');
  if (venueId) reservationsParams.set('venueId', venueId);

  let initialReservations: Reservation[] = [];
  try {
    const response = await GET<ReservationListResponse>(`/reservations?${reservationsParams.toString()}`);
    initialReservations = response.items ?? [];
  } catch (error) {
    console.error('[floor] failed to preload reservations', error);
  }

  return (
    <FloorClient
      initialDate={date}
      initialTime={time}
      initialPartySize={DEFAULT_PARTY_SIZE}
      venueId={venueId}
      initialAvailability={initialAvailability}
      initialReservations={initialReservations}
    />
  );
}

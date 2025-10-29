import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import HoldsClient from './HoldsClient';
import { GET } from '@/lib/api';
import { VENUE_TZ } from '@/lib/time';
import type { AvailabilityResponse, Hold } from '@/lib/types';

const DEFAULT_PARTY_SIZE = 2;

function nowInVenue() {
  const now = new Date();
  const zoned = toZonedTime(now, VENUE_TZ);
  return {
    date: format(zoned, 'yyyy-MM-dd'),
    time: format(zoned, 'HH:mm'),
  };
}

export default async function HoldsPage() {
  const { date, time } = nowInVenue();
  const venueId = process.env.NEXT_PUBLIC_VENUE_ID?.trim() || null;

  const holdsParams = new URLSearchParams();
  holdsParams.set('date', date);
  if (venueId) holdsParams.set('venueId', venueId);

  let initialHolds: Hold[] = [];
  try {
    const response = await GET<{ items: Hold[]; total: number }>(`/holds?${holdsParams.toString()}`);
    initialHolds = response.items ?? [];
  } catch (error) {
    console.error('[holds] failed to preload holds', error);
  }

  const availabilityParams = new URLSearchParams();
  availabilityParams.set('date', date);
  availabilityParams.set('time', time);
  availabilityParams.set('partySize', String(DEFAULT_PARTY_SIZE));
  if (venueId) availabilityParams.set('venueId', venueId);

  let initialAvailability: AvailabilityResponse['tables'] = [];
  try {
    const response = await GET<AvailabilityResponse>(`/availability?${availabilityParams.toString()}`);
    initialAvailability = response.tables;
  } catch (error) {
    console.error('[holds] failed to preload availability', error);
  }

  return (
    <HoldsClient
      initialDate={date}
      initialTime={time}
      initialParty={DEFAULT_PARTY_SIZE}
      initialHolds={initialHolds}
      initialAvailability={initialAvailability}
      venueId={venueId}
    />
  );
}

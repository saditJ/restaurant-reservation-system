const BOOKING_WIDGET_ORIGIN =
  process.env.BOOKING_WIDGET_ORIGIN ?? 'http://localhost:3002';

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeDateInput(input?: string | Date): string {
  if (!input) {
    return toDateString(new Date());
  }
  if (input instanceof Date) {
    return toDateString(input);
  }
  return input;
}

interface BookingLinkOptions {
  venueId: string;
  date?: string | Date;
  partySize?: number;
}

export function buildBookingWidgetLink({
  venueId,
  date,
  partySize = 2,
}: BookingLinkOptions): string {
  const url = new URL('/', BOOKING_WIDGET_ORIGIN);
  url.searchParams.set('venueId', venueId);
  url.searchParams.set('date', normalizeDateInput(date));
  url.searchParams.set('partySize', `${partySize}`);
  return url.toString();
}

export function getDefaultReservationDate(): string {
  return normalizeDateInput();
}

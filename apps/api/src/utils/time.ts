/**
 * Utilities for dealing with venue-local date/time slots.
 * These provide a single place to refine timezone handling later on.
 */

export type SlotInput = {
  date: string; // YYYY-MM-DD in venue timezone
  time: string; // HH:MM (24h) in venue timezone
};

export function assertValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid date format, expected YYYY-MM-DD');
  }
}

export function assertValidTime(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Invalid time format, expected HH:MM');
  }
}

export function toUtcInstant(
  timezone: string,
  { date, time }: SlotInput,
): Date {
  assertValidDate(date);
  assertValidTime(time);

  const [year, month, day] = date.split('-').map((x) => Number(x));
  const [hour, minute] = time.split(':').map((x) => Number(x));

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    throw new Error('Invalid slot date/time');
  }

  // Build a UTC date, then shift using Intl to respect the venue timezone.
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const tzShifted = new Date(
    naiveUtc.toLocaleString('en-US', { timeZone: timezone }),
  );
  const offsetMs = naiveUtc.getTime() - tzShifted.getTime();
  return new Date(tzShifted.getTime() + offsetMs);
}

export function normalizeTimeTo24h(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return value;
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

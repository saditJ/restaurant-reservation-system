/**
 * DST-safe timezone utilities for venue availability calculations.
 * Uses date-fns-tz to ensure correct behavior across timezone transitions.
 */
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { addMinutes as addMinutesUTC, startOfDay, parseISO } from 'date-fns';

/**
 * Add minutes to a local time in a specific timezone, preserving DST transitions.
 * This ensures that adding 60 minutes during a DST spring-forward still results in the correct local time.
 * 
 * @param localTime ISO string or Date representing local time in the target timezone
 * @param minutes Number of minutes to add
 * @param timezone IANA timezone (e.g., 'America/New_York')
 * @returns New Date representing the resulting UTC instant
 */
export function addMinutesTz(
  localTime: Date | string,
  minutes: number,
  timezone: string,
): Date {
  const local = typeof localTime === 'string' ? parseISO(localTime) : localTime;
  const utcInstant = fromZonedTime(local, timezone);
  const newUtc = addMinutesUTC(utcInstant, minutes);
  return newUtc;
}

/**
 * Get the start of day (00:00:00) in a specific timezone, returned as UTC Date.
 * 
 * @param dateStr Date string in YYYY-MM-DD format
 * @param timezone IANA timezone
 * @returns UTC Date representing midnight in the target timezone
 */
export function startOfDayTz(dateStr: string, timezone: string): Date {
  // Parse date in local timezone context
  const [year, month, day] = dateStr.split('-').map(Number);
  const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0);
  return fromZonedTime(localMidnight, timezone);
}

/**
 * Convert a local date-time string (YYYY-MM-DD HH:mm) in a timezone to UTC Date.
 * 
 * @param dateStr Date in YYYY-MM-DD format
 * @param timeStr Time in HH:mm format (24-hour)
 * @param timezone IANA timezone
 * @returns UTC Date
 */
export function toUTC(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const localDateTime = new Date(year, month - 1, day, hour, minute, 0, 0);
  return fromZonedTime(localDateTime, timezone);
}

/**
 * Convert a UTC Date to local date-time in a timezone.
 * 
 * @param utcDate UTC Date
 * @param timezone IANA timezone
 * @returns Object with date (YYYY-MM-DD) and time (HH:mm) in local timezone
 */
export function fromUTC(
  utcDate: Date,
  timezone: string,
): { date: string; time: string } {
  const zonedDate = toZonedTime(utcDate, timezone);
  const date = format(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
  const time = format(zonedDate, 'HH:mm', { timeZone: timezone });
  return { date, time };
}

/**
 * Get the day of week (0=Sunday, 6=Saturday) for a date in a specific timezone.
 * 
 * @param dateStr Date in YYYY-MM-DD format
 * @param timezone IANA timezone
 * @returns Day of week (0-6)
 */
export function getDayOfWeekTz(dateStr: string, timezone: string): number {
  const midnight = startOfDayTz(dateStr, timezone);
  const zonedDate = toZonedTime(midnight, timezone);
  return zonedDate.getDay();
}

/**
 * Convert time string (HH:mm) to minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string (HH:mm).
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Format Date as ISO string (YYYY-MM-DDTHH:mm:ss.sssZ).
 */
export function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * Check if two time ranges overlap.
 */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

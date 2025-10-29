import { addMinutes } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const VENUE_TZ = process.env.NEXT_PUBLIC_VENUE_TZ?.trim() || 'Europe/Tirane';

type LocaleOptions = Intl.DateTimeFormatOptions & {
  locale?: string;
  timeZone?: string;
};

const OFFSET_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

function hasExplicitOffset(value: string) {
  return OFFSET_PATTERN.test(value);
}

function pad(value: string | number) {
  return String(value).padStart(2, '0');
}

function normalizeTimeSegment(segment: string | undefined, fallback = '00') {
  if (!segment || Number.isNaN(Number.parseInt(segment, 10))) {
    return pad(fallback);
  }
  return pad(Number.parseInt(segment, 10));
}

function normalizeTime(value: string | undefined) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '00:00:00';
  const match = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?/);
  if (!match) return '00:00:00';
  const [, h, m, s] = match;
  return `${normalizeTimeSegment(h)}:${normalizeTimeSegment(m)}:${normalizeTimeSegment(s)}`;
}

function normalizeLocalDateTime(input: string | undefined) {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00`;
  }
  const replaced = trimmed.replace(' ', 'T');
  if (!replaced.includes('T')) return null;
  const [date, time] = replaced.split('T');
  if (!date) return null;
  return `${date}T${normalizeTime(time)}`;
}

function buildLocalDateTime(date: string | undefined, time: string | undefined) {
  const normalized = normalizeLocalDateTime(
    `${(date ?? '').trim()}T${(time ?? '').trim()}`.replace(/T$/, ''),
  );
  return normalized;
}

function isValidDate(date: Date | null | undefined): date is Date {
  return !!date && Number.isFinite(date.getTime());
}

function coerceDate(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return isValidDate(value) ? new Date(value.getTime()) : null;
  }
  if (typeof value === 'number') {
    const num = new Date(value);
    return isValidDate(num) ? num : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = toZonedDate(trimmed);
    return isValidDate(parsed) ? parsed : null;
  }
  return null;
}

function formatWithOptions(
  value: Date | string | number | null | undefined,
  defaults: Intl.DateTimeFormatOptions,
  options: LocaleOptions = {},
) {
  const date = coerceDate(value);
  if (!date) return '';
  const { locale, timeZone, ...intl } = options;
  const tz = (timeZone ?? VENUE_TZ).trim() || VENUE_TZ;
  const resolved = toZonedTime(date, tz);
  const formatter = new Intl.DateTimeFormat(locale ?? 'en-US', {
    timeZone: tz,
    ...defaults,
    ...intl,
  });
  return formatter.format(resolved);
}

export function toZonedDate(isoOrLocal: string) {
  const trimmed = isoOrLocal?.trim?.() ?? '';
  if (!trimmed) return new Date(Number.NaN);
  if (hasExplicitOffset(trimmed)) {
    const date = new Date(trimmed);
    return isValidDate(date) ? date : new Date(Number.NaN);
  }
  const normalized = normalizeLocalDateTime(trimmed);
  if (normalized) {
    try {
      return fromZonedTime(normalized, VENUE_TZ);
    } catch {
      return new Date(Number.NaN);
    }
  }
  const fallback = new Date(trimmed);
  return isValidDate(fallback) ? fallback : new Date(Number.NaN);
}

export function formatSlot(localDate: string, localTime: string) {
  const normalized = buildLocalDateTime(localDate, localTime);
  if (!normalized) return '';
  let startUtc: Date;
  try {
    startUtc = fromZonedTime(normalized, VENUE_TZ);
  } catch {
    return '';
  }
  const zoned = toZonedTime(startUtc, VENUE_TZ);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: VENUE_TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const parts = formatter.formatToParts(zoned);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const dateLabel = [weekday, day, month].filter(Boolean).join(' ').trim();
  const timeLabel = formatWithOptions(zoned, { hour: '2-digit', minute: '2-digit', hour12: false }, { timeZone: VENUE_TZ });
  return `${dateLabel} \u00b7 ${timeLabel}`;
}

export function formatRange(localDate: string, timeStart: string, minutes: number) {
  if (!Number.isFinite(minutes)) return '';
  const normalized = buildLocalDateTime(localDate, timeStart);
  if (!normalized) return '';
  let startUtc: Date;
  try {
    startUtc = fromZonedTime(normalized, VENUE_TZ);
  } catch {
    return '';
  }
  const endUtc = addMinutes(startUtc, minutes);
  const startLocal = toZonedTime(startUtc, VENUE_TZ);
  const endLocal = toZonedTime(endUtc, VENUE_TZ);
  const formatTime = (date: Date) =>
    formatWithOptions(date, { hour: '2-digit', minute: '2-digit', hour12: false }, { timeZone: VENUE_TZ });
  return `${formatTime(startLocal)}\u2013${formatTime(endLocal)}`;
}

export function formatVenueTime(
  value: Date | string | number | null | undefined,
  options: LocaleOptions = {},
) {
  return formatWithOptions(
    value,
    { hour: '2-digit', minute: '2-digit', hour12: false },
    options,
  );
}

export function formatVenueDate(
  value: Date | string | number | null | undefined,
  options: LocaleOptions = {},
) {
  return formatWithOptions(
    value,
    { year: 'numeric', month: 'short', day: 'numeric' },
    options,
  );
}

export function formatVenueDateTime(
  value: Date | string | number | null | undefined,
  options: LocaleOptions = {},
) {
  return formatWithOptions(
    value,
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    options,
  );
}

export function clearTimeFormatCache() {
  // Formatters are created on demand; no caching to clear.
}

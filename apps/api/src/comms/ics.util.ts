import { Temporal } from '@js-temporal/polyfill';

type DateInput = Date | string;

const ICS_LINE_LIMIT = 75;

const pad = (value: number, length = 2) => value.toString().padStart(length, '0');

export function toZonedDateTime(input: DateInput, timeZone: string): Temporal.ZonedDateTime {
  const instant =
    input instanceof Date
      ? Temporal.Instant.from(input.toISOString())
      : Temporal.Instant.from(input);
  return instant.toZonedDateTimeISO(timeZone);
}

export function formatZonedDateTime(zoned: Temporal.ZonedDateTime): string {
  return (
    pad(zoned.year, 4) +
    pad(zoned.month) +
    pad(zoned.day) +
    'T' +
    pad(zoned.hour) +
    pad(zoned.minute) +
    pad(zoned.second)
  );
}

export function formatUtcInstant(instant: Temporal.Instant): string {
  const zoned = instant.toZonedDateTimeISO('UTC');
  return (
    pad(zoned.year, 4) +
    pad(zoned.month) +
    pad(zoned.day) +
    'T' +
    pad(zoned.hour) +
    pad(zoned.minute) +
    pad(zoned.second) +
    'Z'
  );
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= ICS_LINE_LIMIT) {
    return line;
  }

  let result = line.slice(0, ICS_LINE_LIMIT);
  for (let index = ICS_LINE_LIMIT; index < line.length; index += ICS_LINE_LIMIT) {
    result += `\r\n ${line.slice(index, index + ICS_LINE_LIMIT)}`;
  }
  return result;
}

export function foldIcsLines(lines: string[]): string {
  return lines.map(foldLine).join('\r\n');
}

export function buildIcsBuffer(lines: string[]): Buffer {
  return Buffer.from(`${foldIcsLines(lines)}\r\n`, 'utf-8');
}

/**
 * DST-safe availability engine for generating time slots from venue configuration.
 * This module produces accurate availability windows across timezone transitions.
 */
import type {
  Shift,
  BlackoutDate,
  ServiceBuffer,
  PacingRule,
  AvailabilityRule,
  Reservation,
  Hold,
  Table,
} from '@prisma/client';
import {
  startOfDayTz,
  toUTC,
  fromUTC,
  addMinutesTz,
  getDayOfWeekTz,
  timeToMinutes,
  minutesToTime,
  toISO,
  overlaps,
} from '../common/time';

/**
 * Input configuration for the availability engine.
 */
export type EngineInput = {
  venue: {
    id: string;
    timezone: string;
    turnTimeMin: number;
    defaultDurationMin: number;
  };
  dateRange: {
    startDate: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD (if not provided, use single day)
  };
  partySize: number;
  slotIntervalMinutes?: number; // Default: 15
  shifts: Shift[];
  availabilityRules: AvailabilityRule[];
  blackoutDates: BlackoutDate[];
  pacingRules: PacingRule[];
  serviceBuffer: ServiceBuffer | null;
  tables: Table[];
  reservations: Array<{
    id: string;
    tableIds: string[];
    slotStartUtc: Date;
    durationMinutes: number;
    partySize: number;
  }>;
  holds: Array<{
    id: string;
    tableId: string | null;
    slotStartUtc: Date;
    expiresAt: Date;
    partySize: number;
  }>;
};

/**
 * Output slot with availability information.
 */
export type AvailabilitySlot = {
  startUtc: string; // ISO 8601
  endUtc: string; // ISO 8601
  localDate: string; // YYYY-MM-DD
  localTime: string; // HH:mm
  durationMinutes: number;
  capacityTotal: number; // Total table capacity
  capacityAvailable: number; // Available table count after conflicts
  availableTables: Array<{
    id: string;
    label: string;
    capacity: number;
    area: string | null;
    zone: string | null;
  }>;
  isPacingConstrained: boolean; // True if pacing rules limit this slot
  pacingUsed: number;
  pacingLimit: number;
};

/**
 * Engine output.
 */
export type EngineOutput = {
  slots: AvailabilitySlot[];
  summary: {
    totalSlots: number;
    availableSlots: number;
    blockedSlots: number;
  };
};

/**
 * Main engine function to compute availability slots.
 */
export function computeAvailability(input: EngineInput): EngineOutput {
  const {
    venue,
    dateRange,
    partySize,
    slotIntervalMinutes = 15,
    shifts,
    availabilityRules,
    blackoutDates,
    pacingRules,
    serviceBuffer,
    tables,
    reservations,
    holds,
  } = input;

  // 1) Build base timeline from shifts
  const baseSlots = buildBaseTimeline(
    venue.timezone,
    dateRange.startDate,
    dateRange.endDate || dateRange.startDate,
    shifts,
    slotIntervalMinutes,
  );

  // 2) Apply blackout dates
  const afterBlackout = applyBlackouts(baseSlots, blackoutDates, venue.timezone);

  // 3) Apply service buffer (lead/trailing minutes)
  const afterBuffer = applyServiceBuffer(afterBlackout, serviceBuffer);

  // 4) Find the applicable rule for this party size
  const rule = pickRule(availabilityRules, partySize);
  if (!rule) {
    // No rule matches, return empty
    return {
      slots: [],
      summary: { totalSlots: 0, availableSlots: 0, blockedSlots: 0 },
    };
  }

  // 5) Filter tables by party size
  const eligibleTables = tables.filter((t) => t.capacity >= partySize);
  if (eligibleTables.length === 0) {
    return {
      slots: [],
      summary: { totalSlots: 0, availableSlots: 0, blockedSlots: 0 },
    };
  }

  // 6) Compute occupancy for each slot
  const turnTimeMinutes = venue.turnTimeMin || 0;
  const slotsWithOccupancy = afterBuffer.map((slot) => {
    const slotEnd = new Date(
      new Date(slot.startUtc).getTime() +
        (rule.slotLengthMinutes + turnTimeMinutes + rule.bufferMinutes) * 60_000,
    );

    const occupiedTables = computeOccupiedTables(
      slot.startUtc,
      slotEnd,
      reservations,
      holds,
      availabilityRules,
      rule,
      turnTimeMinutes,
    );

    const availableTables = eligibleTables.filter(
      (t) => !occupiedTables.has(t.id),
    );

    return {
      ...slot,
      durationMinutes: rule.slotLengthMinutes,
      availableTables,
      occupiedTables,
      slotEnd,
    };
  });

  // 7) Apply pacing rules
  const finalSlots = applyPacingRules(
    slotsWithOccupancy,
    pacingRules,
    reservations,
    holds,
  );

  // 8) Format output
  const formattedSlots: AvailabilitySlot[] = finalSlots.map((slot) => {
    const local = fromUTC(new Date(slot.startUtc), venue.timezone);
    return {
      startUtc: slot.startUtc,
      endUtc: new Date(
        new Date(slot.startUtc).getTime() + slot.durationMinutes * 60_000,
      ).toISOString(),
      localDate: local.date,
      localTime: local.time,
      durationMinutes: slot.durationMinutes,
      capacityTotal: eligibleTables.length,
      capacityAvailable: slot.availableTables.length,
      availableTables: slot.availableTables.map((t) => ({
        id: t.id,
        label: t.label,
        capacity: t.capacity,
        area: t.area,
        zone: t.zone,
      })),
      isPacingConstrained: slot.isPacingConstrained,
      pacingUsed: slot.pacingUsed,
      pacingLimit: slot.pacingLimit,
    };
  });

  const totalSlots = formattedSlots.length;
  const availableSlots = formattedSlots.filter((s) => s.capacityAvailable > 0).length;
  const blockedSlots = totalSlots - availableSlots;

  return {
    slots: formattedSlots,
    summary: { totalSlots, availableSlots, blockedSlots },
  };
}

/**
 * Build base timeline from shifts, respecting timezone and DST.
 */
function buildBaseTimeline(
  timezone: string,
  startDate: string,
  endDate: string,
  shifts: Shift[],
  intervalMinutes: number,
): Array<{ startUtc: string }> {
  const slots: Array<{ startUtc: string }> = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    const dow = getDayOfWeekTz(dateStr, timezone);

    // Find shifts for this day
    const dayShifts = shifts.filter((s) => s.dow === dow && s.isActive);

    for (const shift of dayShifts) {
      const startTime = formatShiftTime(shift.startsAtLocal);
      const endTime = formatShiftTime(shift.endsAtLocal);

      const shiftStartUtc = toUTC(dateStr, startTime, timezone);
      let shiftEndUtc = toUTC(dateStr, endTime, timezone);

      // Handle overnight shifts (endTime < startTime)
      if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        shiftEndUtc = addMinutesTz(shiftEndUtc, 24 * 60, timezone);
      }

      // Generate slots at intervalMinutes intervals
      let slotTime = shiftStartUtc.getTime();
      const endTime_ms = shiftEndUtc.getTime();

      while (slotTime < endTime_ms) {
        slots.push({ startUtc: new Date(slotTime).toISOString() });
        slotTime += intervalMinutes * 60_000;
      }
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

/**
 * Apply blackout dates by filtering out slots on blackout days.
 */
function applyBlackouts(
  slots: Array<{ startUtc: string }>,
  blackoutDates: BlackoutDate[],
  timezone: string,
): Array<{ startUtc: string }> {
  const blackoutSet = new Set(
    blackoutDates.map((bd) => bd.date.toISOString().slice(0, 10)),
  );

  return slots.filter((slot) => {
    const local = fromUTC(new Date(slot.startUtc), timezone);
    return !blackoutSet.has(local.date);
  });
}

/**
 * Apply service buffer by filtering slots too close to now or too far in future.
 */
function applyServiceBuffer(
  slots: Array<{ startUtc: string }>,
  serviceBuffer: ServiceBuffer | null,
): Array<{ startUtc: string }> {
  if (!serviceBuffer) return slots;

  const now = new Date();
  const leadMs = (serviceBuffer.beforeMinutes || 0) * 60_000;

  return slots.filter((slot) => {
    const slotTime = new Date(slot.startUtc).getTime();
    return slotTime >= now.getTime() + leadMs;
  });
}

/**
 * Compute which tables are occupied during a given slot.
 */
function computeOccupiedTables(
  slotStartUtc: string,
  slotEnd: Date,
  reservations: Array<{
    tableIds: string[];
    slotStartUtc: Date;
    durationMinutes: number;
    partySize: number;
  }>,
  holds: Array<{
    tableId: string | null;
    slotStartUtc: Date;
    expiresAt: Date;
  }>,
  availabilityRules: AvailabilityRule[],
  defaultRule: AvailabilityRule,
  turnTimeMinutes: number,
): Set<string> {
  const occupied = new Set<string>();
  const slotStart = new Date(slotStartUtc);

  // Check reservations
  for (const res of reservations) {
    const rule = pickRule(availabilityRules, res.partySize) || defaultRule;
    const resEnd = new Date(
      res.slotStartUtc.getTime() +
        (res.durationMinutes + turnTimeMinutes + rule.bufferMinutes) * 60_000,
    );

    if (overlaps(res.slotStartUtc, resEnd, slotStart, slotEnd)) {
      for (const tableId of res.tableIds) {
        occupied.add(tableId);
      }
    }
  }

  // Check holds
  const now = new Date();
  for (const hold of holds) {
    if (!hold.tableId) continue;
    if (hold.expiresAt <= now) continue;

    const holdEnd = new Date(
      hold.slotStartUtc.getTime() +
        (defaultRule.slotLengthMinutes + turnTimeMinutes + defaultRule.bufferMinutes) *
          60_000,
    );

    if (overlaps(hold.slotStartUtc, holdEnd, slotStart, slotEnd)) {
      occupied.add(hold.tableId);
    }
  }

  return occupied;
}

/**
 * Apply pacing rules to limit slots per time window.
 */
function applyPacingRules(
  slots: Array<{
    startUtc: string;
    durationMinutes: number;
    availableTables: Table[];
    occupiedTables: Set<string>;
    slotEnd: Date;
  }>,
  pacingRules: PacingRule[],
  reservations: Array<{ slotStartUtc: Date }>,
  holds: Array<{ slotStartUtc: Date }>,
): Array<{
  startUtc: string;
  durationMinutes: number;
  availableTables: Table[];
  isPacingConstrained: boolean;
  pacingUsed: number;
  pacingLimit: number;
}> {
  // Find the most restrictive pacing rule
  let maxReservations = Number.POSITIVE_INFINITY;
  let windowMinutes = 15; // Default to 15-minute buckets

  for (const rule of pacingRules) {
    if (rule.maxReservations && rule.maxReservations < maxReservations) {
      maxReservations = rule.maxReservations;
      windowMinutes = rule.windowMinutes || 15;
    }
  }

  if (!Number.isFinite(maxReservations)) {
    // No pacing constraints
    return slots.map((s) => ({
      ...s,
      isPacingConstrained: false,
      pacingUsed: 0,
      pacingLimit: Number.POSITIVE_INFINITY,
    }));
  }

  // Group slots by pacing window
  const windows = new Map<string, typeof slots>();
  for (const slot of slots) {
    const windowKey = bucketizeTime(slot.startUtc, windowMinutes);
    const bucket = windows.get(windowKey) || [];
    bucket.push(slot);
    windows.set(windowKey, bucket);
  }

  // Count usage per window
  const usageMap = new Map<string, number>();
  for (const res of reservations) {
    const key = bucketizeTime(res.slotStartUtc.toISOString(), windowMinutes);
    usageMap.set(key, (usageMap.get(key) || 0) + 1);
  }
  for (const hold of holds) {
    const key = bucketizeTime(hold.slotStartUtc.toISOString(), windowMinutes);
    usageMap.set(key, (usageMap.get(key) || 0) + 1);
  }

  // Apply pacing limit to each window
  const result: Array<{
    startUtc: string;
    durationMinutes: number;
    availableTables: Table[];
    isPacingConstrained: boolean;
    pacingUsed: number;
    pacingLimit: number;
  }> = [];

  for (const [windowKey, windowSlots] of windows.entries()) {
    const used = usageMap.get(windowKey) || 0;
    const remaining = Math.max(0, maxReservations - used);

    let included = 0;
    for (const slot of windowSlots) {
      const isPacingConstrained = included >= remaining;
      result.push({
        startUtc: slot.startUtc,
        durationMinutes: slot.durationMinutes,
        availableTables: isPacingConstrained ? [] : slot.availableTables,
        isPacingConstrained,
        pacingUsed: used + included,
        pacingLimit: maxReservations,
      });
      if (slot.availableTables.length > 0) included++;
    }
  }

  return result.sort(
    (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
  );
}

/**
 * Pick the best matching availability rule for a party size.
 */
function pickRule(
  rules: AvailabilityRule[],
  partySize: number,
): AvailabilityRule | null {
  let candidate: AvailabilityRule | null = null;

  for (const rule of rules) {
    if (partySize < rule.minPartySize || partySize > rule.maxPartySize) {
      continue;
    }

    if (!candidate) {
      candidate = rule;
      continue;
    }

    const candidateSpan = candidate.maxPartySize - candidate.minPartySize;
    const ruleSpan = rule.maxPartySize - rule.minPartySize;

    if (
      ruleSpan < candidateSpan ||
      (ruleSpan === candidateSpan && rule.minPartySize > candidate.minPartySize)
    ) {
      candidate = rule;
    }
  }

  return candidate;
}

/**
 * Format shift time from Prisma Time type to HH:mm string.
 */
function formatShiftTime(value: Date): string {
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Bucketize a time to a window (e.g., 10:27 -> 10:15 for 15-min buckets).
 */
function bucketizeTime(isoTime: string, windowMinutes: number): string {
  const date = new Date(isoTime);
  const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const bucket = Math.floor(totalMinutes / windowMinutes) * windowMinutes;
  return minutesToTime(bucket);
}

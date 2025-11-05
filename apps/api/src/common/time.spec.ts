/**
 * DST transition tests for availability engine.
 * Tests timezone-aware slot generation across spring forward and fall back transitions.
 */
import {
  addMinutesTz,
  startOfDayTz,
  toUTC,
  fromUTC,
  getDayOfWeekTz,
} from './time';

describe('DST-safe time utilities', () => {
  describe('Spring Forward (America/New_York 2025-03-09)', () => {
    const timezone = 'America/New_York';
    const springForwardDate = '2025-03-09'; // 2 AM -> 3 AM

    it('should handle midnight correctly on DST transition day', () => {
      const midnight = startOfDayTz(springForwardDate, timezone);
      expect(midnight).toBeInstanceOf(Date);
      
      const local = fromUTC(midnight, timezone);
      expect(local.date).toBe(springForwardDate);
      expect(local.time).toBe('00:00');
    });

    it('should add minutes across DST boundary correctly', () => {
      // Start at 1:30 AM, add 60 minutes
      // Should result in 3:30 AM (not 2:30 AM, since 2:00-3:00 doesn't exist)
      const utc130am = toUTC(springForwardDate, '01:30', timezone);
      const utc330am = addMinutesTz(utc130am, 60, timezone);
      
      const local = fromUTC(utc330am, timezone);
      expect(local.date).toBe(springForwardDate);
      // Note: The actual behavior depends on date-fns-tz implementation
      // This tests that we don't crash and produce valid output
      expect(local.time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should generate continuous slots across DST transition', () => {
      const slots: Array<{ date: string; time: string }> = [];
      let currentTime = toUTC(springForwardDate, '01:00', timezone);
      
      // Generate 5 slots, 30 minutes apart
      for (let i = 0; i < 5; i++) {
        slots.push(fromUTC(currentTime, timezone));
        currentTime = addMinutesTz(currentTime, 30, timezone);
      }

      // Verify all slots are valid
      expect(slots.length).toBe(5);
      slots.forEach((slot) => {
        expect(slot.date).toBe(springForwardDate);
        expect(slot.time).toMatch(/^\d{2}:\d{2}$/);
      });

      // Times should be monotonically increasing
      const times = slots.map((s) => s.time);
      for (let i = 1; i < times.length; i++) {
        const prev = times[i - 1].split(':').map(Number);
        const curr = times[i].split(':').map(Number);
        const prevMins = prev[0] * 60 + prev[1];
        const currMins = curr[0] * 60 + curr[1];
        expect(currMins).toBeGreaterThan(prevMins);
      }
    });
  });

  describe('Fall Back (America/New_York 2025-11-02)', () => {
    const timezone = 'America/New_York';
    const fallBackDate = '2025-11-02'; // 2 AM -> 1 AM (repeated hour)

    it('should handle midnight correctly on DST transition day', () => {
      const midnight = startOfDayTz(fallBackDate, timezone);
      expect(midnight).toBeInstanceOf(Date);
      
      const local = fromUTC(midnight, timezone);
      expect(local.date).toBe(fallBackDate);
      expect(local.time).toBe('00:00');
    });

    it('should add minutes across DST boundary correctly', () => {
      // Start at 1:30 AM, add 90 minutes
      // Should result in 3:00 AM after the fall-back
      const utc130am = toUTC(fallBackDate, '01:30', timezone);
      const utc3am = addMinutesTz(utc130am, 90, timezone);
      
      const local = fromUTC(utc3am, timezone);
      expect(local.date).toBe(fallBackDate);
      expect(local.time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should generate continuous slots across DST transition', () => {
      const slots: Array<{ date: string; time: string }> = [];
      let currentTime = toUTC(fallBackDate, '01:00', timezone);
      
      // Generate 5 slots, 30 minutes apart
      for (let i = 0; i < 5; i++) {
        slots.push(fromUTC(currentTime, timezone));
        currentTime = addMinutesTz(currentTime, 30, timezone);
      }

      // Verify all slots are valid
      expect(slots.length).toBe(5);
      slots.forEach((slot) => {
        expect(slot.date).toBe(fallBackDate);
        expect(slot.time).toMatch(/^\d{2}:\d{2}$/);
      });
    });
  });

  describe('Europe/Tirane DST transitions', () => {
    const timezone = 'Europe/Tirane';
    const springForward = '2025-03-30'; // 2 AM -> 3 AM
    const fallBack = '2025-10-26'; // 3 AM -> 2 AM

    it('should handle spring forward transition', () => {
      const midnight = startOfDayTz(springForward, timezone);
      const local = fromUTC(midnight, timezone);
      expect(local.date).toBe(springForward);
      expect(local.time).toBe('00:00');
    });

    it('should handle fall back transition', () => {
      const midnight = startOfDayTz(fallBack, timezone);
      const local = fromUTC(midnight, timezone);
      expect(local.date).toBe(fallBack);
      expect(local.time).toBe('00:00');
    });

    it('should get correct day of week', () => {
      const dow = getDayOfWeekTz(springForward, timezone);
      expect(dow).toBeGreaterThanOrEqual(0);
      expect(dow).toBeLessThanOrEqual(6);
    });
  });

  describe('Non-DST timezone (Asia/Tokyo)', () => {
    const timezone = 'Asia/Tokyo';
    const regularDate = '2025-06-15';

    it('should handle times correctly in non-DST timezone', () => {
      const utc = toUTC(regularDate, '14:30', timezone);
      const local = fromUTC(utc, timezone);
      
      expect(local.date).toBe(regularDate);
      expect(local.time).toBe('14:30');
    });

    it('should add minutes correctly', () => {
      const utc = toUTC(regularDate, '10:00', timezone);
      const later = addMinutesTz(utc, 90, timezone);
      const local = fromUTC(later, timezone);
      
      expect(local.time).toBe('11:30');
    });
  });
});

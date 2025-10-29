import {
  buildAnonymizedFields,
  computeGuestToken,
  normalizeEmail,
} from './anonymizer';

describe('privacy anonymizer', () => {
  it('normalizes emails to lowercase', () => {
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
  });

  it('generates stable tokens for the same guest email', () => {
    const email = normalizeEmail('space.cadet@example.com');
    const tokenA = computeGuestToken(email, 'reservation-a');
    const tokenB = computeGuestToken(email, 'reservation-b');
    expect(tokenA).toBe(tokenB);
  });

  it('generates distinct tokens when no email is available', () => {
    const tokenA = computeGuestToken(null, 'reservation-a');
    const tokenB = computeGuestToken(null, 'reservation-b');
    expect(tokenA).not.toBe(tokenB);
  });

  it('builds anonymized fields with tokens and redacted notes', () => {
    const timestamp = new Date('2025-10-28T12:00:00Z');
    const update = buildAnonymizedFields({
      reservationId: 'res-123',
      normalizedEmail: normalizeEmail('guest@example.com'),
      hadEmail: true,
      hadPhone: true,
      hadNotes: true,
      timestamp,
      reason: 'manual-erase',
    });

    expect(update.guestName).toMatch(/^Anonymized Guest /);
    expect(update.guestEmail).toMatch(/^anon\+/);
    expect(update.guestPhone).toMatch(/^ANON-/);
    expect(update.notes).toBe('[REDACTED]');
    expect(update.piiAnonymizedAt.toISOString()).toBe(timestamp.toISOString());
    expect(update.piiAnonymizedReason).toBe('manual-erase');
    expect(update.piiAnonymizedToken).toHaveLength(12);
  });
});

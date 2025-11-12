import { LinkTokenService } from '../security/link-token.service';

const DEFAULT_WIDGET_HOST = 'https://example.test';

export function resolveGuestWidgetHost(): string {
  const raw = process.env.GUEST_WIDGET_HOST?.trim();
  if (!raw) return DEFAULT_WIDGET_HOST;
  const compact = raw.replace(/\s/g, '');
  return compact.replace(/\/+$/, '') || DEFAULT_WIDGET_HOST;
}

export function buildGuestReservationLinks(
  linkTokens: LinkTokenService,
  reservationId: string,
): { modifyUrl: string; cancelUrl: string } {
  const host = resolveGuestWidgetHost();
  const modifyToken = linkTokens.issueToken(reservationId, 'reschedule');
  const cancelToken = linkTokens.issueToken(reservationId, 'cancel');
  return {
    modifyUrl: `${host}/guest/modify?token=${encodeURIComponent(modifyToken)}`,
    cancelUrl: `${host}/guest/cancel?token=${encodeURIComponent(cancelToken)}`,
  };
}

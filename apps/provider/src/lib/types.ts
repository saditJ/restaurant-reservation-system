export type ProviderUsageKey = {
  apiKeyId: string;
  monthlyCap: number;
  usedThisMonth: number;
  rps: number;
  burst: number;
};

export type ProviderUsageListResponse = {
  items: ProviderUsageKey[];
  total: number;
};

export type ProviderUsageTimeseriesPoint = {
  date: string;
  count: number;
};

export type ProviderUsageTimeseriesResponse = {
  points: ProviderUsageTimeseriesPoint[];
  sum: number;
};

export type ApiKeySummary = {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  rateLimitPerMin: number;
  burstLimit: number;
  monthlyCap: number;
  tokenPreview: string | null;
  scopes: string[];
  usage: {
    allows24h: number;
    drops24h: number;
  };
};

export type ApiKeyListResponse = {
  items: ApiKeySummary[];
};

export type TenantSummary = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  slug: string | null;
};

export const RESERVATION_WEBHOOK_EVENTS = [
  'reservation.created',
  'reservation.updated',
  'reservation.cancelled',
  'reservation.seated',
  'reservation.completed',
] as const;

export type ReservationWebhookEvent =
  (typeof RESERVATION_WEBHOOK_EVENTS)[number];

export type WebhookSecretPreview = {
  endpointId: string;
  lastFour: string;
  secretCreatedAt: string;
  secretRotatedAt: string | null;
};

export type WebhookEndpoint = {
  id: string;
  url: string;
  description: string | null;
  isActive: boolean;
  events: ReservationWebhookEvent[];
  createdAt: string;
  updatedAt: string;
  secret?: string | null;
  secretPreview?: WebhookSecretPreview | null;
};

export type WebhookDeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type WebhookPayload = {
  reservation: {
    id: string;
    code: string;
    status: string;
    guestName: string | null;
  };
};

export type WebhookDelivery = {
  id: string;
  endpointId: string;
  event: ReservationWebhookEvent;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastError: string | null;
  failureReason: string | null;
  failedAt: string | null;
  nextAttemptAt: string;
  lastAttemptAt: string;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  payload: WebhookPayload;
};

export type WebhookDeliveryListResponse = {
  items: WebhookDelivery[];
  total: number;
};

export type WebhookSecretResponse = WebhookSecretPreview;

export type OnboardingTenantResponse = {
  tenantId: string;
  slug: string;
  created: boolean;
};

export type OnboardingVenueResponse = {
  venueId: string;
  slug: string | null;
  created: boolean;
};

export type OnboardingShiftsResponse = {
  venueId: string;
  template: 'restaurant' | 'bar' | 'cafe';
  created: number;
  updated: number;
  total: number;
};

export type OnboardingTablesResponse = {
  venueId: string;
  created: number;
  updated: number;
  total: number;
};

export type OnboardingApiKeyResponse = {
  apiKeyId: string;
  tenantId: string;
  rateLimitPerMin: number;
  burstLimit: number;
  monthlyCap: number;
  maskedKey: string | null;
  plaintextKey: string | null;
  reused: boolean;
};

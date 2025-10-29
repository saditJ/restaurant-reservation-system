import { SetMetadata } from '@nestjs/common';

export type RateLimitOptions = {
  requestsPerMinute?: number;
  burstLimit?: number;
  tokens?: number;
};

export const RATE_LIMIT_OPTIONS = 'rate-limit:options';

export function RateLimit(options: RateLimitOptions) {
  return SetMetadata(RATE_LIMIT_OPTIONS, options);
}

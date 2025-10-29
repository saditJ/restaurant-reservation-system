import { createSdkClient } from '@reserve/sdk';
import type { SdkClient } from '@reserve/sdk';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

function toAbsoluteBase(base?: string | null) {
  if (!base) return undefined;
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return base;
  }
  return base.startsWith('/') ? base : `/${base}`;
}

function resolveApiKey(): string | undefined {
  const direct = process.env.API_KEY?.trim();
  if (direct) return direct;
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (nodeEnv !== 'production') {
    return 'dev-local-key';
  }
  return undefined;
}

export function createServerSdk(): SdkClient {
  const base =
    process.env.API_BASE_INTERNAL && process.env.API_BASE_INTERNAL.length > 0
      ? process.env.API_BASE_INTERNAL
      : toAbsoluteBase(PUBLIC_BASE) ?? '/api';
  const apiKey = resolveApiKey();
  return createSdkClient({
    baseUrl: base,
    apiKey,
    fetch,
  });
}

export function createBrowserSdk(): SdkClient {
  const base = toAbsoluteBase(PUBLIC_BASE) ?? '/api';
  return createSdkClient({
    baseUrl: base,
    fetch,
  });
}

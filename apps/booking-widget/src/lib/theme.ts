import 'server-only';

import { headers } from 'next/headers';

type HeaderBag = Awaited<ReturnType<typeof headers>>;

export type TenantThemeResponse = {
  tenantId: string;
  theme: {
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
      foreground?: string;
    };
    logoUrl?: string | null;
    font?: string | null;
  } | null;
  domains: string[];
};

export async function fetchResolvedTheme(): Promise<TenantThemeResponse | null> {
  const hdrs = await headers();
  const tenantId = extractTenantId(hdrs);
  const segment = tenantId ? encodeURIComponent(tenantId) : 'host';

  try {
    const payload = await fetchThemeFromProxy(segment, hdrs);
    return payload;
  } catch {
    return null;
  }
}

function extractTenantId(hdrs: HeaderBag): string | undefined {
  const searchParams = extractSearchParams(hdrs);
  const explicit =
    searchParams.get('tenantId') ?? searchParams.get('venueId') ?? undefined;
  return explicit ? explicit.trim() || undefined : undefined;
}

function extractSearchParams(hdrs: HeaderBag): URLSearchParams {
  const explicit = hdrs.get('x-invoke-query');
  if (explicit) {
    return new URLSearchParams(explicit);
  }

  const nextUrl = hdrs.get('next-url');
  if (nextUrl) {
    return searchParamsFromUrl(nextUrl);
  }

  const forwardedUri = hdrs.get('x-forwarded-uri');
  if (forwardedUri) {
    return searchParamsFromUrl(forwardedUri);
  }

  const referer = hdrs.get('referer');
  if (referer) {
    return searchParamsFromUrl(referer);
  }

  return new URLSearchParams();
}

function searchParamsFromUrl(value: string) {
  try {
    const syntheticBase = value.startsWith('http')
      ? undefined
      : 'http://local.test';
    const parsed = new URL(value, syntheticBase);
    return parsed.searchParams;
  } catch {
    const idx = value.indexOf('?');
    if (idx >= 0) {
      return new URLSearchParams(value.slice(idx + 1));
    }
    return new URLSearchParams();
  }
}

async function fetchThemeFromProxy(
  tenantSegment: string,
  hdrs: HeaderBag,
): Promise<TenantThemeResponse> {
  const baseUrl = resolveBaseUrl(hdrs);
  const url = new URL(`/api/v1/tenants/${tenantSegment}/theme`, baseUrl);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Theme request failed: ${response.status}`);
  }
  return (await response.json()) as TenantThemeResponse;
}

function resolveBaseUrl(hdrs: HeaderBag) {
  const proto =
    hdrs.get('x-forwarded-proto') ??
    hdrs.get('next-url-proto') ??
    'http';
  const host =
    hdrs.get('x-forwarded-host') ??
    hdrs.get('host') ??
    'localhost:3000';
  return `${proto}://${host}`;
}

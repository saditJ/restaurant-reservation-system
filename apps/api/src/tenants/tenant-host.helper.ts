import type { Request } from 'express';

export type TenantHostLookup = (host: string) => Promise<string | undefined>;

let lookupFn: TenantHostLookup | undefined;

export function registerTenantHostLookup(fn: TenantHostLookup) {
  lookupFn = fn;
}

export async function getTenantIdFromHost(
  req: Request & { tenantId?: string },
): Promise<string | undefined> {
  if (req.tenantId) {
    return req.tenantId;
  }
  if (!lookupFn) {
    return undefined;
  }
  const host = extractHostFromHeaders(req);
  if (!host) {
    return undefined;
  }
  return lookupFn(host);
}

export function extractHostFromHeaders(req: Request): string | undefined {
  const forwarded = firstHeader(req.headers['x-forwarded-host']);
  const fallback =
    typeof req.headers.host === 'string' ? req.headers.host : undefined;
  const candidate = forwarded ?? fallback;
  if (!candidate) {
    return undefined;
  }
  const first = candidate.split(',')[0] ?? candidate;
  return normalizeDomain(first);
}

export function normalizeDomain(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  let working = value.trim();
  if (!working) {
    return undefined;
  }

  // Drop protocol prefixes if someone pastes a URL.
  working = working.replace(/^[a-z]+:\/\//i, '');

  // Ignore any path segments.
  const slashIndex = working.indexOf('/');
  if (slashIndex !== -1) {
    working = working.slice(0, slashIndex);
  }

  // Handle IPv6 literals like [::1]:3000
  if (working.startsWith('[')) {
    const endBracket = working.indexOf(']');
    if (endBracket !== -1) {
      working = working.slice(0, endBracket + 1);
    }
  } else {
    const colonIndex = working.indexOf(':');
    if (colonIndex !== -1) {
      working = working.slice(0, colonIndex);
    }
  }

  working = working.replace(/\.$/, '').toLowerCase();
  return working || undefined;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

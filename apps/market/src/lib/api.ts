import 'server-only';

import { headers } from 'next/headers';

export interface VenueSummary {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  cuisines: string[];
  priceTier: number | null;
  description?: string | null;
  heroImageUrl?: string | null;
  rating?: number | null;
  reviewCount?: number;
  shortDescription?: string | null;
  nextAvailable?: string | null;
}

export interface VenueListResponse {
  items: VenueSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type VenueFacetBucket = {
  value: string;
  count: number;
};

export interface VenueFacetResponse {
  city: VenueFacetBucket[];
  cuisine: VenueFacetBucket[];
  priceLevel: Array<{ value: number; count: number }>;
}

export interface ReviewSummary {
  id: string;
  guestName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  response: string | null;
  respondedAt: string | null;
}

export interface VenueProfile {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  timezone: string;
  cuisines: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  heroImageUrl: string | null;
  gallery: string[];
  priceTier: number | null;
  rating: number | null;
  reviewCount: number;
  tags: string[];
  description: string | null;
  hours: unknown;
  amenities: string[];
  dressCode: string | null;
  parkingInfo: string | null;
  publicTransit: string | null;
  highlights: string[];
  menuSummary: PublicMenuResponse;
  widget: {
    tenantId: string;
    bookingUrl: string;
  } | null;
  reviews: ReviewSummary[];
  nextAvailableSlots: string[];
}

export interface PublicMenuItem {
  id: string;
  name: string;
  short: string | null;
  price: number;
  currency: string;
  isAvailable: boolean;
  imageUrl: string | null;
  tags: string[];
}

export interface PublicMenuSection {
  id?: string;
  title: string;
  position: number;
  items: PublicMenuItem[];
}

export interface PublicMenuResponse {
  sections: PublicMenuSection[];
}

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

type JsonRecord = Record<string, unknown>;

type ProxyInit = RequestInit & { next?: RequestInit['next'] };

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

async function resolveBaseUrl(): Promise<string> {
  const hdrs = await headers();
  const forwardedProto =
    hdrs.get('x-forwarded-proto') ?? hdrs.get('next-url-proto');
  const forwardedHost =
    hdrs.get('x-forwarded-host') ??
    hdrs.get('host') ??
    'localhost:3000';
  const protocol =
    forwardedProto ??
    (forwardedHost.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${forwardedHost}`;
}

async function fetchFromProxy<T>(
  path: string,
  init: ProxyInit = {},
): Promise<T> {
  const baseUrl = await resolveBaseUrl();
  const normalized = normalizePath(path);
  const target = new URL(`/api${normalized}`, baseUrl);
  const headersInit: HeadersInit = new Headers(init.headers);
  headersInit.set('accept', 'application/json');

  const response = await fetch(target, {
    ...init,
    headers: headersInit,
    cache: init.cache ?? 'no-store',
    next: init.next,
  });

  if (!response.ok) {
    throw new Error(`Proxy request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export type VenueListQuery = {
  query?: string;
  city?: string[];
  cuisine?: string[];
  priceLevel?: number[];
  sort?: string;
  page?: number;
  pageSize?: number;
};

function buildListSearchParams(filters: VenueListQuery): URLSearchParams {
  const search = new URLSearchParams();
  if (filters.query) {
    search.set('query', filters.query);
  }
  if (Array.isArray(filters.city)) {
    filters.city
      .filter((value) => value && value.trim().length > 0)
      .forEach((value) => search.append('city', value));
  }
  if (Array.isArray(filters.cuisine)) {
    filters.cuisine
      .filter((value) => value && value.trim().length > 0)
      .forEach((value) => search.append('cuisine', value));
  }
  if (Array.isArray(filters.priceLevel)) {
    filters.priceLevel
      .filter((value) => Number.isFinite(value))
      .forEach((value) => search.append('priceLevel', String(value)));
  }
  if (filters.sort && filters.sort.trim()) {
    search.set('sort', filters.sort.trim());
  }
  if (filters.page && Number.isFinite(filters.page)) {
    search.set('page', String(filters.page));
  }
  if (filters.pageSize && Number.isFinite(filters.pageSize)) {
    search.set('pageSize', String(filters.pageSize));
  }
  return search;
}

type ApiVenueListItem = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  cuisines: string[];
  heroImageUrl: string | null;
  priceLevel: number | null;
  rating: number | null;
  reviewCount: number;
  shortDescription: string | null;
  nextAvailable: string | null;
};

type ApiVenueListResponse = {
  items: ApiVenueListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function searchMarketVenues(
  filters: VenueListQuery,
  options: { revalidate?: number } = {},
): Promise<VenueListResponse> {
  const params = buildListSearchParams(filters);
  if (!params.has('pageSize')) {
    params.set('pageSize', filters.pageSize ? String(filters.pageSize) : '24');
  }
  const queryString = params.toString();
  const payload = await fetchFromProxy<ApiVenueListResponse>(
    `/v1/market/venues${queryString ? `?${queryString}` : ''}`,
    {
      cache: 'force-cache',
      next: { revalidate: options.revalidate ?? 60 },
    },
  );

  return {
    items: payload.items.map(mapVenueListItem),
    total: payload.total,
    page: payload.page,
    pageSize: payload.pageSize,
    totalPages: payload.totalPages,
  };
}

export async function fetchVenueFacets(
  filters: VenueListQuery,
  options: { revalidate?: number } = {},
): Promise<VenueFacetResponse> {
  const params = buildListSearchParams(filters);
  params.delete('page');
  params.delete('pageSize');
  const queryString = params.toString();
  const payload = await fetchFromProxy<VenueFacetResponse>(
    `/v1/market/venues/facets${queryString ? `?${queryString}` : ''}`,
    {
      cache: 'force-cache',
      next: { revalidate: options.revalidate ?? 60 },
    },
  );
  return payload;
}

export async function getVenueSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;
  let totalPages = 1;
  const maxPages = 10;

  do {
    const result = await searchMarketVenues(
      { page, pageSize: 100, sort: 'name' },
      { revalidate: 60 },
    );
    result.items.forEach((item) => {
      if (item.slug) {
        slugs.push(item.slug);
      }
    });
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages && page <= maxPages);

  return Array.from(new Set(slugs));
}

export async function getVenueProfile(slug: string): Promise<VenueProfile> {
  const payload = await fetchFromProxy<any>(
    `/v1/market/venues/${slug}`,
    {
      cache: 'force-cache',
      next: { revalidate: 60 },
    },
  );

  return {
    id: payload.id,
    slug: payload.slug ?? payload.id,
    name: payload.name,
    address: payload.address ?? null,
    city: payload.city ?? null,
    state: payload.state ?? null,
    country: payload.country ?? null,
    postalCode: payload.postalCode ?? null,
    timezone: payload.timezone,
    cuisines: Array.isArray(payload.cuisines) ? payload.cuisines : [],
    phone: payload.phone ?? null,
    email: payload.email ?? null,
    website: payload.website ?? null,
    heroImageUrl: payload.heroImageUrl ?? null,
    gallery: Array.isArray(payload.gallery) ? payload.gallery : [],
    priceTier:
      typeof payload.priceLevel === 'number' ? payload.priceLevel : 2,
    rating:
      typeof payload.rating === 'number'
        ? Math.round(payload.rating * 10) / 10
        : null,
    reviewCount: payload.reviewCount ?? 0,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    description: payload.description ?? null,
    hours: payload.hours ?? null,
    amenities: Array.isArray(payload.amenities) ? payload.amenities : [],
    dressCode: payload.dressCode ?? null,
    parkingInfo: payload.parkingInfo ?? null,
    publicTransit: payload.publicTransit ?? null,
    highlights: Array.isArray(payload.amenities)
      ? payload.amenities.slice(0, 3)
      : [],
    menuSummary:
      payload.menuSummary && Array.isArray(payload.menuSummary.sections)
        ? payload.menuSummary
        : { sections: [] },
    widget: payload.widget ?? null,
    reviews: Array.isArray(payload.reviews) ? payload.reviews : [],
    nextAvailableSlots: Array.isArray(payload.nextAvailableSlots)
      ? payload.nextAvailableSlots
      : [],
  };
}

export async function getVenueMenu(
  venueId: string,
): Promise<PublicMenuResponse> {
  try {
    const payload = await fetchFromProxy<PublicMenuResponse>(
      `/v1/menus/${encodeURIComponent(venueId)}/public`,
      {
        cache: 'force-cache',
        next: { revalidate: 300 },
      },
    );
    if (payload && Array.isArray(payload.sections)) {
      return payload;
    }
  } catch {
    // Swallow and fall through to empty state.
  }
  return { sections: [] };
}

export async function getTenantTheme(): Promise<TenantThemeResponse | null> {
  try {
    return await fetchFromProxy<TenantThemeResponse>(
      '/v1/tenants/host/theme',
      {
        cache: 'force-cache',
        next: { revalidate: 300 },
      },
    );
  } catch {
    return null;
  }
}

function mapVenueListItem(item: ApiVenueListItem): VenueSummary {
  return {
    id: item.id,
    slug: item.slug ?? item.id,
    name: item.name,
    city: item.city,
    cuisines: Array.isArray(item.cuisines) ? item.cuisines : [],
    priceTier:
      typeof item.priceLevel === 'number' ? item.priceLevel : null,
    description: item.shortDescription,
    heroImageUrl: item.heroImageUrl ?? undefined,
    rating:
      typeof item.rating === 'number'
        ? Math.round(item.rating * 10) / 10
        : null,
    reviewCount: item.reviewCount ?? 0,
    shortDescription: item.shortDescription,
    nextAvailable: item.nextAvailable,
  };
}

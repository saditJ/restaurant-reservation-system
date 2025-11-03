import 'server-only';

import { headers } from 'next/headers';

export interface VenueSummary {
  id: string;
  slug: string;
  name: string;
  city: string;
  cuisines: string[];
  priceTier: number;
  description?: string;
  heroImageUrl?: string;
}

export interface VenueProfile extends VenueSummary {
  address?: string;
  highlights?: string[];
  phone?: string;
  website?: string;
}

const FALLBACK_VENUES: VenueSummary[] = [
  {
    id: 'granite-oak-001',
    slug: 'granite-oak',
    name: 'Granite Oak Supper Club',
    city: 'San Francisco',
    cuisines: ['Californian', 'Seafood'],
    priceTier: 3,
    description:
      'Chef-driven tasting menus rooted in the Bay, served in an intimate dining room overlooking the Embarcadero.',
    heroImageUrl:
      'https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=1200',
  },
  {
    id: 'marigold-market-882',
    slug: 'marigold-market',
    name: 'Marigold Market Kitchen',
    city: 'Austin',
    cuisines: ['Tex-Mex', 'Vegetarian'],
    priceTier: 2,
    description:
      'Colorful plates, housemade tortillas, and seasonal vegetables highlight this East Austin favorite.',
    heroImageUrl:
      'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?q=80&w=1200',
  },
  {
    id: 'noir-lounge-409',
    slug: 'noir-lounge',
    name: 'Noir Lounge',
    city: 'Chicago',
    cuisines: ['French', 'Cocktail Bar'],
    priceTier: 4,
    description:
      'An art-deco cocktail bar pairing vintage ambiance with a compact menu of French-leaning plates for sharing.',
    heroImageUrl:
      'https://images.unsplash.com/photo-1498837167922-ddd27525d352?q=80&w=1200',
  },
];

const FALLBACK_PROFILES: Record<string, VenueProfile> = {
  'granite-oak': {
    ...FALLBACK_VENUES[0],
    address: '18 Pier Place, San Francisco, CA 94111',
    highlights: [
      'Seven-course seasonal tasting',
      'Sommelier wine pairings',
      'Bayfront private dining room',
    ],
    phone: '(415) 555-2075',
    website: 'https://example.com/granite-oak',
  },
  'marigold-market': {
    ...FALLBACK_VENUES[1],
    address: '2202 Cesar Chavez St, Austin, TX 78702',
    highlights: [
      'Hand-pressed corn tortillas',
      "Weekend farmer's market brunch",
      'Agave-driven cocktail list',
    ],
    phone: '(512) 555-8840',
    website: 'https://example.com/marigold-market',
  },
  'noir-lounge': {
    ...FALLBACK_VENUES[2],
    address: '1212 W Randolph St, Chicago, IL 60607',
    highlights: [
      'Live jazz on weekends',
      'Tableside martini service',
      "Chef's counter omakase",
    ],
    phone: '(312) 555-9412',
    website: 'https://example.com/noir-lounge',
  },
};

type JsonRecord = Record<string, unknown>;

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

function resolveBaseUrl(): string {
  const hdrs = headers();
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

async function fetchFromProxy<T extends JsonRecord>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = resolveBaseUrl();
  const normalized = normalizePath(path);
  const target = new URL(`/api${normalized}`, baseUrl);
  const headersInit: HeadersInit = new Headers(init?.headers);
  headersInit.set('accept', 'application/json');

  const response = await fetch(target, {
    ...init,
    headers: headersInit,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Proxy request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getFeaturedVenues(): Promise<VenueSummary[]> {
  try {
    const payload = await fetchFromProxy<{ data?: VenueSummary[] }>(
      '/v1/market/featured',
    );
    if (Array.isArray(payload.data) && payload.data.length > 0) {
      return payload.data;
    }
  } catch {
    // Silent fallback to mock data until the upstream endpoint is finalized.
  }

  return FALLBACK_VENUES;
}

export async function getVenueProfile(slug: string): Promise<VenueProfile> {
  try {
    const payload = await fetchFromProxy<{ data?: VenueProfile }>(
      `/v1/market/venues/${slug}`,
    );
    if (payload.data) {
      return payload.data;
    }
  } catch {
    // Silent fallback to mock data until the upstream endpoint is finalized.
  }

  return (
    FALLBACK_PROFILES[slug] ?? {
      id: slug,
      slug,
      name: slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      city: 'Coming Soon',
      cuisines: ['TBD'],
      priceTier: 2,
      description:
        'This venue profile is still being assembled. Check back soon for menus, photos, and live availability.',
      heroImageUrl:
        'https://images.unsplash.com/photo-1528712306091-ed0763094c98?q=80&w=1200',
      address: 'Check back soon',
      highlights: [
        'Menu and gallery coming online shortly',
        'Reservations will open as soon as we sync availability',
      ],
    }
  );
}

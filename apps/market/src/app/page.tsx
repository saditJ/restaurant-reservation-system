import type { Metadata } from 'next';
import Link from 'next/link';

import {
  fetchVenueFacets,
  searchMarketVenues,
  type VenueFacetResponse,
  type VenueFacetBucket,
} from '@/lib/api';
import { formatPriceTier } from '@/lib/format';
import { SearchBar } from './components/SearchBar';
import { VenueCard } from './components/VenueCard';
import { SortSelect } from './components/SortSelect';

export const revalidate = 60;

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({
  searchParams = {},
}: PageProps): Promise<Metadata> {
  const query =
    typeof searchParams.query === 'string' ? searchParams.query.trim() : '';
  if (query) {
    return {
      title: `Reserve Market – Results for "${query}"`,
      description: `Discover venues on Reserve Market that match "${query}" and book instantly with live availability.`,
    };
  }
  return {
    title: 'Reserve Market – Discover standout venues',
    description:
      'Browse curated restaurants, lounges, and pop-ups, then jump straight into booking with live availability.',
  };
}

export default async function HomePage({ searchParams = {} }: PageProps) {
  const filters = parseFilters(searchParams);
  const apiFilters = {
    query: filters.query || undefined,
    city: filters.city,
    cuisine: filters.cuisine,
    priceLevel: filters.priceLevel,
    sort: filters.sort,
    page: filters.page,
  };

  const [venuesResult, facetsResult] = await Promise.all([
    searchMarketVenues(apiFilters, { revalidate: 60 }).catch(() => null),
    fetchVenueFacets(apiFilters, { revalidate: 60 }).catch(() => null),
  ]);

  const venues =
    venuesResult ??
    ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
      totalPages: 0,
    } as const);
  const facets: VenueFacetResponse = facetsResult ?? {
    city: [],
    cuisine: [],
    priceLevel: [],
  };

  const hasError = !venuesResult;
  const currentParams = buildSearchParams(searchParams);
  const searchParamsString = currentParams.toString();

  return (
    <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 py-16 sm:py-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Reserve Market
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            Discover venues worth crossing town for
          </h1>
          <p className="max-w-2xl text-balance text-base text-slate-600 sm:text-lg">
            Browse curated restaurants, lounges, and pop-ups, then book
            instantly via the Reserve widget. Filter by city, cuisine, or price
            to find your next favorite.
          </p>
        </div>
        <SearchBar
          initialQuery={filters.query}
          city={filters.city}
          cuisine={filters.cuisine}
          priceLevel={filters.priceLevel}
          sort={filters.sort}
        />
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-16 lg:grid-cols-4">
        <aside className="lg:col-span-1">
          <FiltersSidebar
            facets={facets}
            filters={filters}
            searchParams={currentParams}
          />
        </aside>
        <section className="lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="text-sm text-slate-600">
              Showing{' '}
              <span className="font-semibold text-slate-900">
                {venues.items.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-900">
                {venues.total}
              </span>{' '}
              results
              {filters.query ? (
                <>
                  {' '}
                  for{' '}
                  <span className="font-semibold">&ldquo;{filters.query}&rdquo;</span>
                </>
              ) : null}
            </div>
            <SortSelect
              value={filters.sort}
              searchParams={searchParamsString}
            />
          </div>

          {hasError && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              We couldn&apos;t load results right now. Showing the latest cached
              data.
            </div>
          )}

          {venues.items.length === 0 ? (
            <EmptyState query={filters.query} />
          ) : (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {venues.items.map((venue) => (
                <VenueCard key={venue.id} venue={venue} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function FiltersSidebar({
  facets,
  filters,
  searchParams,
}: {
  facets: VenueFacetResponse;
  filters: ParsedFilters;
  searchParams: URLSearchParams;
}) {
  const hasFilters =
    filters.query ||
    filters.city.length > 0 ||
    filters.cuisine.length > 0 ||
    filters.priceLevel.length > 0;
  const clearParams = new URLSearchParams(searchParams.toString());
  ['query', 'city', 'cuisine', 'priceLevel', 'page'].forEach((key) =>
    clearParams.delete(key),
  );

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Filters</h2>
        {hasFilters ? (
          <Link
            href={clearParams.toString() ? `/?${clearParams}` : '/'}
            className="text-xs font-semibold text-slate-500 underline-offset-4 hover:underline"
          >
            Clear all
          </Link>
        ) : null}
      </div>
      <div className="mt-6 space-y-6">
        <FacetGroup
          title="City"
          facetKey="city"
          buckets={facets.city}
          selected={filters.city}
          searchParams={searchParams}
        />
        <FacetGroup
          title="Cuisine"
          facetKey="cuisine"
          buckets={facets.cuisine}
          selected={filters.cuisine}
          searchParams={searchParams}
        />
        <FacetGroup
          title="Price level"
          facetKey="priceLevel"
          buckets={facets.priceLevel.map((entry) => ({
            value: String(entry.value),
            label: formatPriceTier(entry.value),
            count: entry.count,
          }))}
          selected={filters.priceLevel.map((value) => String(value))}
          searchParams={searchParams}
        />
      </div>
    </div>
  );
}

type FacetBucket =
  | VenueFacetBucket
  | { value: string; label: string; count: number };

function FacetGroup({
  title,
  facetKey,
  buckets,
  selected,
  searchParams,
}: {
  title: string;
  facetKey: string;
  buckets: FacetBucket[];
  selected: string[];
  searchParams: URLSearchParams;
}) {
  if (!buckets.length) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </p>
        <p className="mt-2 text-sm text-slate-400">No data yet</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {buckets.map((bucket) => {
          const label =
            'label' in bucket ? bucket.label : bucket.value || 'Unknown';
          const value = bucket.value;
          const isActive = selected.includes(value);
          const href = buildFacetHref(searchParams, facetKey, value, isActive);
          return (
            <Link
              key={`${facetKey}-${value}`}
              href={href}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span>{label}</span>
              <span className="text-[0.7rem] text-slate-400">
                {bucket.count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="mt-10 rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="text-lg font-semibold text-slate-900">
        {query ? (
          <>
            No venues found for <span>&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          'No venues match those filters yet'
        )}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Try adjusting your filters or check back soon as new venues launch.
      </p>
    </div>
  );
}

type ParsedFilters = {
  query: string;
  city: string[];
  cuisine: string[];
  priceLevel: number[];
  sort: string;
  page: number;
};

function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ParsedFilters {
  const query =
    typeof searchParams.query === 'string' ? searchParams.query.trim() : '';
  const city = toStringArray(searchParams.city);
  const cuisine = toStringArray(searchParams.cuisine);
  const priceLevel = toStringArray(searchParams.priceLevel)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const sort =
    typeof searchParams.sort === 'string' && searchParams.sort.trim()
      ? searchParams.sort.trim()
      : 'rating';
  const pageRaw =
    typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  return {
    query,
    city,
    cuisine,
    priceLevel,
    sort,
    page,
  };
}

function toStringArray(
  value: string | string[] | undefined,
): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return value.trim() ? [value.trim()] : [];
}

function buildSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
    } else if (typeof value === 'string') {
      params.append(key, value);
    }
  });
  return params;
}

function buildFacetHref(
  searchParams: URLSearchParams,
  key: string,
  value: string,
  isActive: boolean,
): string {
  const next = new URLSearchParams(searchParams.toString());
  const existing = next.getAll(key);
  next.delete(key);
  if (isActive) {
    existing
      .filter((entry) => entry !== value)
      .forEach((entry) => next.append(key, entry));
  } else {
    existing.forEach((entry) => next.append(key, entry));
    next.append(key, value);
  }
  next.delete('page');
  const query = next.toString();
  return query ? `/?${query}` : '/';
}

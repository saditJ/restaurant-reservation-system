import { GET } from '@/lib/api';
import type { ReservationListResponse } from '@/lib/types';
import ReservationsClient from './ReservationsClient';
import { DEFAULT_PAGE_SIZE, SORT_FIELDS, STATUS_FILTERS } from './config';

type SortField = (typeof SORT_FIELDS)[number]['key'];
type SortDir = 'asc' | 'desc';
type FilterKey = (typeof STATUS_FILTERS)[number];

type PageProps = {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[value.length - 1] : undefined;
  }
  return value;
}

export default async function ReservationsPage({ searchParams }: PageProps) {
  const resolvedSearchParams =
    searchParams instanceof Promise ? await searchParams : searchParams ?? {};

  const statusParam = getStringParam(resolvedSearchParams.status);
  const filter: FilterKey = STATUS_FILTERS.includes(statusParam as FilterKey)
    ? (statusParam as FilterKey)
    : 'ALL';

  const query = getStringParam(resolvedSearchParams.q) ?? '';
  const date = getStringParam(resolvedSearchParams.date) ?? '';
  const sortByParam = getStringParam(resolvedSearchParams.sortBy) as SortField | undefined;
  const sortDirParam = getStringParam(resolvedSearchParams.sortDir) as SortDir | undefined;
  const sortBy: SortField = SORT_FIELDS.some((field) => field.key === sortByParam)
    ? (sortByParam as SortField)
    : 'date';
  const sortDir: SortDir = sortDirParam === 'asc' ? 'asc' : 'desc';

  const limitParam = Number.parseInt(getStringParam(resolvedSearchParams.limit) ?? '', 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200
      ? limitParam
      : DEFAULT_PAGE_SIZE;
  const offsetParam = Number.parseInt(getStringParam(resolvedSearchParams.offset) ?? '', 10);
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
  const search = new URLSearchParams();
  search.set('limit', String(limit));
  search.set('offset', String(offset));
  if (filter !== 'ALL') search.set('status', filter);
  if (query.trim()) search.set('q', query.trim());
  if (date.trim()) search.set('date', date.trim());
  search.set('sortBy', sortBy);
  search.set('sortDir', sortDir);
  search.set('includeConflicts', '1');

  const response = await GET<ReservationListResponse>(`/reservations?${search.toString()}`);

  const items = response.items ?? [];
  const total = Number.isFinite(response.total) ? Number(response.total) : items.length;

  return (
    <ReservationsClient
      initialItems={items}
      initialTotal={total}
      initialLimit={limit}
      initialOffset={offset}
      initialFilter={filter}
      initialQuery={query}
      initialSortBy={sortBy}
      initialSortDir={sortDir}
      initialDate={date || undefined}
    />
  );
}

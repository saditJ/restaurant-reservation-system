'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  apiGet,
  apiJSON,
  formatApiError,
  assignReservationTables,
  fetchSeatingSuggestions,
} from '@/lib/api';
import { formatRange, formatSlot } from '@/lib/time';
import type {
  Reservation,
  ReservationListResponse,
  ReservationStatus,
  ReservationTable,
  SeatingSuggestion,
} from '@/lib/types';
import HealthBadge from '../components/HealthBadge';
import ReservationEditModal from './ReservationEditModal';
import ReservationNewModal from './ReservationNewModal';
import { DEFAULT_PAGE_SIZE, SORT_FIELDS, STATUS_FILTERS } from './config';

type SortField = (typeof SORT_FIELDS)[number]['key'];
type SortDir = 'asc' | 'desc';
type FilterKey = (typeof STATUS_FILTERS)[number];

type ReservationsClientProps = {
  initialItems: Reservation[];
  initialTotal: number;
  initialLimit: number;
  initialOffset: number;
  initialFilter: FilterKey;
  initialQuery: string;
  initialSortBy: SortField;
  initialSortDir: SortDir;
  initialDate?: string | null;
};

type Toast = {
  id: string;
  kind: 'loading' | 'success' | 'error';
  title: string;
  message?: string;
  progress?: number;
  href?: string;
  filename?: string;
};

type ReservationPageState = {
  items: Reservation[];
  total: number;
};

export default function ReservationsClient({
  initialItems,
  initialTotal,
  initialLimit,
  initialOffset,
  initialFilter,
  initialQuery,
  initialSortBy,
  initialSortDir,
  initialDate,
}: ReservationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startTransition] = useTransition();

  const [pageSize, setPageSize] = useState(initialLimit || DEFAULT_PAGE_SIZE);

  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<SortField>(initialSortBy);
  const [sortDir, setSortDir] = useState<SortDir>(initialSortDir);
  const [offset, setOffset] = useState(initialOffset);
  const [data, setData] = useState<ReservationPageState>({
    items: initialItems,
    total: initialTotal,
  });
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(initialDate ?? '');
  const [searchInput, setSearchInput] = useState(initialQuery);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading = isNavigating;

  const [editing, setEditing] = useState<Reservation | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seatOpen, setSeatOpen] = useState(false);
  const [seatTarget, setSeatTarget] = useState<Reservation | null>(null);
  const [seatSuggestions, setSeatSuggestions] = useState<SeatingSuggestion[]>([]);
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [seatManualInput, setSeatManualInput] = useState('');
  const [assigningTables, setAssigningTables] = useState(false);

  const page = useMemo(
    () => Math.max(1, Math.floor(offset / (pageSize || DEFAULT_PAGE_SIZE)) + 1),
    [offset, pageSize],
  );
  const visibleCount = data.items.length;
  const startIndex = visibleCount > 0 ? offset + 1 : 0;
  const endIndex = visibleCount > 0 ? offset + visibleCount : 0;

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

useEffect(() => {
  setSortBy(initialSortBy);
  setSortDir(initialSortDir);
}, [initialSortBy, initialSortDir]);

useEffect(() => {
  setPageSize(initialLimit || DEFAULT_PAGE_SIZE);
}, [initialLimit]);

useEffect(() => {
  setOffset(initialOffset);
}, [initialOffset]);

  useEffect(() => {
    setData({ items: initialItems, total: initialTotal });
    setError(null);
  }, [initialItems, initialTotal]);

  useEffect(() => {
    setQuery(initialQuery);
    setSearchInput(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setDateFilter(initialDate ?? '');
  }, [initialDate]);

  useEffect(
    () => () => {
      if (searchDebounce.current) {
        clearTimeout(searchDebounce.current);
        searchDebounce.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!seatOpen || !seatTarget) return;
    const latest = data.items.find((row) => row.id === seatTarget.id);
    if (latest && latest.updatedAt !== seatTarget.updatedAt) {
      setSeatTarget(latest);
    }
  }, [seatOpen, seatTarget, data.items]);

  const navigateWith = useCallback(
    (
      patch: Partial<{
        filter: FilterKey;
        query: string;
        sortBy: SortField;
        sortDir: SortDir;
        page: number;
        offset: number;
        limit: number;
        date: string;
      }>,
    ) => {
      const nextFilter = patch.filter ?? filter;
      const nextQuery = patch.query ?? query;
      const nextSortBy = patch.sortBy ?? sortBy;
      const nextSortDir = patch.sortDir ?? sortDir;
      const nextLimit = patch.limit ?? pageSize;
      const nextOffsetRaw =
        patch.offset ?? (patch.page !== undefined ? (patch.page - 1) * nextLimit : offset);
      const nextOffset = nextOffsetRaw < 0 ? 0 : nextOffsetRaw;
      const nextDate = patch.date ?? dateFilter;
      const params = new URLSearchParams();
      if (nextFilter !== 'ALL') params.set('status', nextFilter);
      if (nextQuery.trim()) params.set('q', nextQuery.trim());
      if (nextSortBy !== 'date') params.set('sortBy', nextSortBy);
      if (nextSortDir !== 'desc') params.set('sortDir', nextSortDir);
      if (nextDate) params.set('date', nextDate);
      params.set('limit', String(nextLimit));
      params.set('offset', String(nextOffset));
      setError(null);
      startTransition(() => {
        router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
      });
    },
    [filter, query, sortBy, sortDir, pageSize, offset, dateFilter, pathname, router, startTransition],
  );

  useEffect(() => {
    if (searchInput === query) return;
    if (searchDebounce.current) {
      clearTimeout(searchDebounce.current);
    }
    const timer = setTimeout(() => {
      setQuery(searchInput);
      setOffset(0);
      navigateWith({ query: searchInput, offset: 0 });
      if (searchDebounce.current === timer) {
        searchDebounce.current = null;
      }
    }, 300);
    searchDebounce.current = timer;
    return () => {
      clearTimeout(timer);
      if (searchDebounce.current === timer) {
        searchDebounce.current = null;
      }
    };
  }, [searchInput, query, navigateWith]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.total / pageSize)),
    [data.total, pageSize],
  );
  useEffect(() => {
    if (page > totalPages) {
      const next = totalPages;
      const nextOffset = (next - 1) * pageSize;
      setOffset(nextOffset);
      navigateWith({ offset: nextOffset });
    }
  }, [page, totalPages, pageSize, navigateWith]);

  const goToPage = useCallback(
    (nextPage: number) => {
      const target = Math.min(Math.max(nextPage, 1), totalPages);
      const nextOffset = (target - 1) * pageSize;
      setOffset(nextOffset);
      navigateWith({ offset: nextOffset });
    },
    [navigateWith, totalPages, pageSize],
  );

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  };
  const updateToast = (id: string, patch: Partial<Toast>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const normalizeTableIds = (ids: string[]) =>
    Array.from(
      new Set(
        ids
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));

  const suggestionKey = (ids: string[]) => normalizeTableIds(ids).join('|');

  const parseManualTables = (input: string) => normalizeTableIds(input.split(/[,\\s+]+/));

  const loadSeatSuggestions = async (reservation: Reservation) => {
    setSeatLoading(true);
    setSeatError(null);
    try {
      const response = await fetchSeatingSuggestions(reservation.id, 3);
      setSeatSuggestions(response.suggestions);
    } catch (error: unknown) {
      const meta = formatApiError(error);
      setSeatError(meta.message || 'Failed to load suggestions');
    } finally {
      setSeatLoading(false);
    }
  };

  const openSeatModal = async (reservation: Reservation) => {
    setSeatTarget(reservation);
    setSeatOpen(true);
    setSeatSuggestions([]);
    setSeatManualInput('');
    await loadSeatSuggestions(reservation);
  };

  const closeSeatModal = () => {
    setSeatOpen(false);
    setSeatTarget(null);
    setSeatSuggestions([]);
    setSeatError(null);
    setSeatManualInput('');
  };

  const assignTablesToReservation = async (
    reservation: Reservation,
    tableIds: string[],
  ) => {
    const normalized = normalizeTableIds(tableIds);
    if (normalized.length === 0) {
      setSeatError('Provide at least one table');
      return;
    }

    const current =
      data.items.find((row) => row.id === reservation.id) ?? reservation;

    const match = seatSuggestions.find(
      (suggestion) => suggestionKey(suggestion.tableIds) === suggestionKey(normalized),
    );

    const optimisticTables: ReservationTable[] = (match
      ? match.tables
      : normalized.map((tableId) => ({
          tableId,
          label: tableId,
          capacity: null,
          area: null,
          zone: null,
          joinGroupId: null,
          wear: 0,
        }))).map((table, index) => ({
      tableId: table.tableId,
      label: table.label ?? table.tableId,
      capacity: table.capacity ?? null,
      area: table.area ?? null,
      zone: table.zone ?? null,
      joinGroupId: table.joinGroupId ?? null,
      order: index,
    }));

    const totalCapacity = optimisticTables.reduce(
      (sum, table) => sum + (table.capacity ?? 0),
      0,
    );

    const optimistic: Reservation = {
      ...current,
      status: 'SEATED',
      tableId: normalized[0] ?? null,
      tableLabel:
        optimisticTables[0]?.label ?? normalized[0] ?? current.tableLabel,
      tableArea: optimisticTables[0]?.area ?? current.tableArea ?? null,
      tableCapacity:
        totalCapacity > 0 ? totalCapacity : current.tableCapacity ?? null,
      tables: optimisticTables,
      updatedAt: new Date().toISOString(),
    };

    setData((prev) => ({
      ...prev,
      items: prev.items.map((row) =>
        row.id === optimistic.id ? optimistic : row,
      ),
    }));
    setSeatTarget(optimistic);
    setAssigningTables(true);
    setSeatError(null);

    try {
      const assigned = await assignReservationTables(reservation.id, normalized);
      let latest = assigned;
      if (assigned.status !== 'SEATED') {
        latest = await apiJSON<Reservation>(
          `/reservations/${reservation.id}/status`,
          'PATCH',
          { status: 'SEATED' },
        );
      }
      setData((prev) => ({
        ...prev,
        items: prev.items.map((row) =>
          row.id === latest.id ? latest : row,
        ),
      }));
      setSeatTarget(latest);
      setSeatOpen(false);
    } catch (error: unknown) {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((row) =>
          row.id === current.id ? current : row,
        ),
      }));
      setSeatTarget(current);
      const meta = formatApiError(error);
      const message =
        meta.status === 409
          ? 'Those tables just booked elsewhere. Try another option.'
          : meta.message || 'Failed to assign tables';
      setSeatError(message);
    } finally {
      setAssigningTables(false);
    }
  };

  const handleSuggestionAssign = (tableIds: string[]) => {
    if (!seatTarget) return;
    void assignTablesToReservation(seatTarget, tableIds);
  };

  const handleManualAssign = () => {
    if (!seatTarget) return;
    const ids = parseManualTables(seatManualInput);
    if (ids.length === 0) {
      setSeatError('Provide at least one table');
      return;
    }
    void assignTablesToReservation(seatTarget, ids);
  };

  const handleStatusChange = async (reservation: Reservation, next: ReservationStatus) => {
    if (reservation.status === next) return;
    const optimistic = { ...reservation, status: next };
    setData((prev) => ({
      ...prev,
      items: prev.items.map((r) => (r.id === reservation.id ? optimistic : r)),
    }));
    try {
      const result = await apiJSON<Reservation>(`/reservations/${reservation.id}/status`, 'PATCH', { status: next });
      setData((prev) => ({
        ...prev,
        items: prev.items.map((r) => (r.id === reservation.id ? result : r)),
      }));
    } catch (error: unknown) {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((r) => (r.id === reservation.id ? reservation : r)),
      }));
      const meta = formatApiError(error);
      alert(meta.message || 'Failed to update status');
    }
  };

  const handleSave = (updated: Reservation) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.map((r) => (r.id === updated.id ? updated : r)),
    }));
  };

  const handleDelete = (id: string) => {
    setData((prev) => ({
      total: prev.total - 1,
      items: prev.items.filter((r) => r.id !== id),
    }));
  };

  const handleNewReplace = (tempId: string, server: Reservation) => {
    setData((prev) => ({
      total: prev.total + (prev.items.some((r) => r.id === server.id) ? 0 : 1),
      items: prev.items
        .filter((r) => r.id !== tempId)
        .concat(server)
        .sort((a, b) =>
          `${b.slotLocalDate}-${b.slotLocalTime}`.localeCompare(`${a.slotLocalDate}-${a.slotLocalTime}`),
        ),
    }));
  };

  const handleNewRollback = (tempId: string) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.filter((r) => r.id !== tempId),
    }));
  };

  const exportCsv = async (scope: 'page' | 'all') => {
    const toastId = addToast({
      kind: 'loading',
      title: scope === 'page' ? 'Exporting current page...' : 'Exporting all results...',
      message: 'Preparing CSV',
      progress: 10,
    });
    const search = new URLSearchParams();
    if (filter !== 'ALL') search.set('status', filter);
    if (query.trim()) search.set('q', query.trim());
    if (dateFilter.trim()) search.set('date', dateFilter.trim());
    search.set('sortBy', sortBy);
    search.set('sortDir', sortDir);
    search.set('includeConflicts', '0');
    if (scope === 'page') {
      search.set('limit', String(pageSize));
      search.set('offset', String((page - 1) * pageSize));
    }
    try {
      const resp = await fetch(`/api/reservations/export.csv?${search.toString()}`, { cache: 'no-store' });
      if (resp.ok && resp.body) {
        const blob = await resp.blob();
        const href = downloadBlob(blob, makeCsvFilename(scope));
        updateToast(toastId, {
          kind: 'success',
          title: 'CSV ready',
          message: 'Download ready',
          href,
          filename: makeCsvFilename(scope),
          progress: 100,
        });
        setTimeout(() => removeToast(toastId), 4000);
        return;
      }
      throw new Error('Stream failed');
    } catch {
      try {
        let items: Reservation[] = [];
        if (scope === 'page') {
          items = data.items;
        } else {
          const all: Reservation[] = [];
          const limit = 500;
          let offset = 0;
          while (true) {
            const p2 = new URLSearchParams(search.toString());
            p2.set('limit', String(limit));
            p2.set('offset', String(offset));
            const json = await apiGet<ReservationListResponse>(`/reservations?${p2.toString()}`);
            const batch = json.items ?? [];
            all.push(...batch);
            offset += limit;
            if (batch.length < limit || all.length >= json.total) break;
            updateToast(toastId, { message: `Fetched ${all.length} rows...` });
          }
          items = all;
        }
        const csv = buildCsv(items);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const href = downloadBlob(blob, makeCsvFilename(scope));
        updateToast(toastId, {
          kind: 'success',
          title: 'CSV ready',
          message: 'Download ready',
          href,
          filename: makeCsvFilename(scope),
          progress: 100,
        });
        setTimeout(() => removeToast(toastId), 4000);
      } catch (error: unknown) {
        console.error(error);
        const meta = formatApiError(error);
        updateToast(toastId, {
          kind: 'error',
          title: 'Export failed',
          message: meta.message || 'Unknown error',
        });
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Reservations</h1>
            <p className="text-sm text-gray-500">
              Manage confirmed bookings, convert holds, and review conflicts.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <HealthBadge />
            <button
              className="px-3 py-1.5 rounded-full border text-sm hover:bg-gray-50"
              onClick={() => setNewOpen(true)}
            >
              New reservation
            </button>
            <button
              className="px-3 py-1.5 rounded-full border text-sm hover:bg-gray-50"
              onClick={() => exportCsv('page')}
            >
              Export page
            </button>
            <button
              className="px-3 py-1.5 rounded-full border text-sm hover:bg-gray-50"
              onClick={() => exportCsv('all')}
            >
              Export all
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-gray-500">Status</span>
            <select
              className="border rounded px-3 py-1.5 text-sm"
              value={filter}
              onChange={(event) => {
                const next = event.target.value as FilterKey;
                setFilter(next);
                setOffset(0);
                navigateWith({ filter: next, offset: 0 });
              }}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All statuses' : option}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-gray-500">Date</span>
            <input
              className="border rounded px-3 py-1.5 text-sm"
              type="date"
              value={dateFilter}
              onChange={(event) => {
                const next = event.target.value;
                setDateFilter(next);
                setOffset(0);
                navigateWith({ date: next, offset: 0 });
              }}
            />
            {dateFilter && (
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => {
                  setDateFilter('');
                  setOffset(0);
                  navigateWith({ date: '', offset: 0 });
                }}
              >
                clear
              </button>
            )}
          </label>

          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <input
              className="border rounded px-3 py-1.5 text-sm flex-1"
              type="search"
              placeholder="Search guest, code, phone..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (offset !== 0) setOffset(0);
              }}
            />
            <select
              className="border rounded px-3 py-1.5 text-sm"
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value as SortField;
                setSortBy(next);
                setOffset(0);
                navigateWith({ sortBy: next, offset: 0 });
              }}
            >
              {SORT_FIELDS.map((s) => (
                <option key={s.key} value={s.key}>
                  Sort by {s.label}
                </option>
              ))}
            </select>
            <button
              className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => {
                const next = sortDir === 'asc' ? 'desc' : 'asc';
                setSortDir(next);
                navigateWith({ sortDir: next });
              }}
            >
              {sortDir === 'asc' ? 'Asc ^' : 'Desc v'}
            </button>
          </div>
        </div>
      </header>

      <section className="bg-white border rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-2xl">
          <div className="text-sm text-gray-600">
            {loading
              ? 'Loading reservations...'
              : visibleCount > 0
              ? `Showing ${startIndex}\u2013${endIndex} of ${data.total}`
              : `0 of ${data.total} reservations`}
            {error && <span className="ml-3 text-red-600">{error}</span>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Guest</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium text-right">Party</th>
                <th className="px-4 py-2 font-medium">Table</th>
                <th className="px-4 py-2 font-medium">Conflicts</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: Math.min(pageSize, 6) }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-t animate-pulse">
                    <td className="px-4 py-3">
                      <div className="h-4 w-20 rounded bg-gray-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-16 rounded bg-gray-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 rounded bg-gray-200" />
                      <div className="mt-2 h-3 w-20 rounded bg-gray-100" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-32 rounded bg-gray-200" />
                      <div className="mt-2 h-3 w-24 rounded bg-gray-100" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="ml-auto h-4 w-10 rounded bg-gray-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="ml-auto h-4 w-24 rounded bg-gray-200" />
                    </td>
                  </tr>
                ))}
              {!loading && data.items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-500" colSpan={9}>
                    No reservations found.
                  </td>
                </tr>
              )}
              {data.items.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                      <span className={`h-2 w-2 rounded-full ${
                        row.status === 'CONFIRMED'
                          ? 'bg-green-500'
                          : row.status === 'PENDING'
                          ? 'bg-amber-500'
                          : row.status === 'SEATED'
                          ? 'bg-blue-500'
                          : row.status === 'COMPLETED'
                          ? 'bg-gray-400'
                          : 'bg-red-500'
                      }`} />
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.guestName || 'Walk-in'}</div>
                    {row.notes && <div className="text-xs text-gray-500">{row.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div>{row.guestPhone || '\u2014'}</div>
                    {row.guestEmail && <div className="text-xs text-gray-500">{row.guestEmail}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div>{formatSlot(row.slotLocalDate, row.slotLocalTime)}</div>
                    {row.durationMinutes > 0 && (
                      <div className="text-xs text-gray-500">
                        {formatRange(row.slotLocalDate, row.slotLocalTime, row.durationMinutes)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{row.partySize}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatReservationTables(row)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>
                      Res: {row.conflicts.reservations.length} · Holds: {row.conflicts.holds.length}
                    </div>
                    {row.hold && (
                      <div className="text-[11px] text-emerald-600">
                        Hold {row.hold.id} converted
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {actionsFor(row.status).map((action) => (
                      <button
                        key={`${action.label}-${action.to}`}
                        className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                        onClick={() => {
                          if (action.kind === 'seat') {
                            void openSeatModal(row);
                          } else {
                            void handleStatusChange(row, action.to);
                          }
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                    <button
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                      onClick={() => {
                        setEditing(row);
                        setEditOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 rounded-b-2xl text-sm">
          <div>
            Page {page} of {totalPages} · Showing {visibleCount > 0 ? `${startIndex}\u2013${endIndex}` : '0'} of {data.total}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 border rounded-full hover:bg-gray-100 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </button>
            <button
              className="px-3 py-1.5 border rounded-full hover:bg-gray-100 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <ReservationEditModal
        open={editOpen}
        initial={editing}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
        onDelete={(id) => {
          handleDelete(id);
          setEditOpen(false);
        }}
        onRestore={(row) => handleSave(row)}
      />

      <ReservationNewModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreateOptimistic={(temp) => {
          setData((prev) => ({
            ...prev,
            items: [temp, ...prev.items],
            total: prev.total + 1,
          }));
        }}
        onReplaceWithServer={handleNewReplace}
        onCreateRollback={handleNewRollback}
      />

      <ToastHost toasts={toasts} onDismiss={removeToast} />
      {seatOpen && seatTarget && (
        <SeatingModal
          reservation={seatTarget}
          suggestions={seatSuggestions}
          loading={seatLoading}
          error={seatError}
          manualInput={seatManualInput}
          onManualInputChange={(value) => { setSeatManualInput(value); setSeatError(null); }}
          onAssign={handleSuggestionAssign}
          onManualAssign={handleManualAssign}
          onClose={closeSeatModal}
          assigning={assigningTables}
          onRetry={() => void loadSeatSuggestions(seatTarget)}
        />
      )}
    </div>
  );
}

type ReservationAction = {
  label: string;
  to: ReservationStatus;
  kind?: 'seat';
};

function actionsFor(status: ReservationStatus): ReservationAction[] {
  switch (status) {
    case 'PENDING':
      return [
        { label: 'Confirm', to: 'CONFIRMED' },
        { label: 'Cancel', to: 'CANCELLED' },
      ];
    case 'CONFIRMED':
      return [
        { label: 'Seat', to: 'SEATED', kind: 'seat' },
        { label: 'Cancel', to: 'CANCELLED' },
      ];
    case 'SEATED':
      return [
        { label: 'Complete', to: 'COMPLETED' },
        { label: 'Cancel', to: 'CANCELLED' },
      ];
    default:
      return [];
  }
}

function formatReservationTables(row: Reservation) {
  if (row.tables && row.tables.length > 0) {
    const ordered = [...row.tables].sort((a, b) => a.order - b.order);
    return ordered
      .map((table) => table.label ?? table.tableId)
      .join(' + ');
  }
  if (row.tableLabel) return row.tableLabel;
  if (row.tableId) return row.tableId;
  return 'Auto';
}

function makeCsvFilename(scope: 'page' | 'all') {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  return `reservations-${scope}-${stamp}.csv`;
}

function csvEscape(value: string) {
  if (value == null) return '';
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function buildCsv(list: Reservation[]): string {
  const header = ['Code', 'Status', 'Guest', 'Phone', 'Date', 'Time', 'Party', 'Table'];
  const rows = list.map((r) => [
    csvEscape(r.code ?? ''),
    csvEscape(r.status ?? ''),
    csvEscape(r.guestName ?? ''),
    csvEscape(r.guestPhone ?? ''),
    csvEscape(r.slotLocalDate ?? ''),
    csvEscape(r.slotLocalTime ?? ''),
    csvEscape(String(r.partySize ?? '')),
    csvEscape(formatReservationTables(r)),
  ]);
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return href;
}

function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="min-w-[240px] max-w-[360px] rounded-lg border bg-white shadow p-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <div
              className={`font-medium ${
                toast.kind === 'error'
                  ? 'text-red-700'
                  : toast.kind === 'success'
                  ? 'text-green-700'
                  : ''
              }`}
            >
              {toast.title}
            </div>
            <button
              className="ml-3 text-xs opacity-60 hover:opacity-100"
              onClick={() => onDismiss(toast.id)}
            >
              ×
            </button>
          </div>
          {toast.message && <div className="mt-1 text-xs text-gray-600">{toast.message}</div>}
          {toast.kind === 'loading' && (
            <div className="mt-2 h-1 rounded bg-gray-200">
              <div
                className="h-1 rounded bg-black transition-all"
                style={{ width: `${toast.progress ?? 25}%` }}
              />
            </div>
          )}
          {toast.kind === 'success' && toast.href && (
            <div className="mt-2">
              <a className="text-xs underline" href={toast.href} download={toast.filename}>
                Download again
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}









type SeatingModalProps = {
  reservation: Reservation;
  suggestions: SeatingSuggestion[];
  loading: boolean;
  error: string | null;
  manualInput: string;
  onManualInputChange: (value: string) => void;
  onAssign: (tableIds: string[]) => void;
  onManualAssign: () => void;
  onClose: () => void;
  assigning: boolean;
  onRetry: () => void;
};

function SeatingModal({
  reservation,
  suggestions,
  loading,
  error,
  manualInput,
  onManualInputChange,
  onAssign,
  onManualAssign,
  onClose,
  assigning,
  onRetry,
}: SeatingModalProps) {
  const tableSummary = (tables: SeatingSuggestion['tables']) =>
    tables
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((table) => table.label ?? table.tableId)
      .join(' + ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Seat reservation</div>
            <div className="text-xs text-gray-500">
              {reservation.slotLocalDate} at {reservation.slotLocalTime} | party {reservation.partySize}
            </div>
          </div>
          <button
            type="button"
            className="text-xs opacity-60 hover:opacity-100"
            onClick={onClose}
          >
            A-
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">Suggested tables</div>
            {loading && (
              <div className="mt-2 text-xs text-gray-500">Loading suggestions...</div>
            )}
            {!loading && error && (
              <div className="mt-2 flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>{error}</span>
                <button
                  type="button"
                  className="rounded border border-amber-400 px-2 py-1 text-[11px]"
                  onClick={onRetry}
                  disabled={assigning}
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && (
              <ul className="mt-3 space-y-2">
                {suggestions.map((suggestion) => (
                  <li
                    key={suggestion.tableIds.join('|')}
                    className="flex items-start justify-between rounded border px-3 py-2"
                  >
                    <div className="pr-4">
                      <div className="text-sm font-medium">
                        {tableSummary(suggestion.tables)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {suggestion.explanation}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400">
                        Capacity {suggestion.totalCapacity} | splits {suggestion.splitCount} | wear max {suggestion.wear.max}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => onAssign(suggestion.tableIds)}
                      disabled={assigning}
                    >
                      {assigning ? 'Assigning...' : 'Assign'}
                    </button>
                  </li>
                ))}
                {suggestions.length === 0 && !loading && !error && (
                  <li className="rounded border border-dashed px-3 py-2 text-xs text-gray-500">
                    No ready suggestions. Try a manual selection below.
                  </li>
                )}
              </ul>
            )}
          </div>

          <div>
            <div className="text-sm font-semibold">Manual override</div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                className="flex-1 rounded border px-3 py-2 text-sm"
                value={manualInput}
                placeholder="e.g. T1+T2"
                onChange={(event) => onManualInputChange(event.target.value)}
              />
              <button
                type="button"
                className="rounded border px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
                onClick={onManualAssign}
                disabled={assigning}
              >
                {assigning ? 'Assigning...' : 'Assign tables'}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-gray-400">
              Separate table ids with + or comma. Example: T1+T2
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




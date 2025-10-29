'use client';

import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  apiGet,
  apiJSON,
  formatApiError,
} from '@/lib/api';
import type {
  NotificationOutboxEntry,
  NotificationOutboxListResponse,
  NotificationOutboxStatus,
} from '@/lib/types';

const STATUS_FILTERS = ['ALL', 'PENDING', 'SENT', 'FAILED'] as const;
type FilterStatus = (typeof STATUS_FILTERS)[number];

type Toast = {
  tone: 'success' | 'error';
  message: string;
};

type NotificationsClientProps = {
  initialItems: NotificationOutboxEntry[];
  initialTotal: number;
  pageSize: number;
  initialStatus: FilterStatus;
  initialSearch: string;
  initialPage: number;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatDate(value: string) {
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export default function NotificationsClient({
  initialItems,
  initialTotal,
  pageSize,
  initialStatus,
  initialSearch,
  initialPage,
}: NotificationsClientProps) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [status, setStatus] = useState<FilterStatus>(initialStatus);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pageCount = useMemo(() => {
    if (pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [pageSize, total]);

  const fetchData = useCallback(
    async (next: { status: FilterStatus; search: string; page: number }) => {
      startTransition(async () => {
        try {
          setError(null);
          const params = new URLSearchParams();
          params.set('limit', String(pageSize));
          params.set('offset', String((next.page - 1) * pageSize));
          if (next.status !== 'ALL') {
            params.set('status', next.status);
          }
          if (next.search.trim()) {
            params.set('search', next.search.trim());
          }

          const response = await apiGet<NotificationOutboxListResponse>(
            `/notifications/outbox?${params.toString()}`,
          );
          setItems(response.items ?? []);
          const nextTotal = Number.isFinite(response.total)
            ? Number(response.total)
            : response.items?.length ?? 0;
          setTotal(nextTotal);
          setStatus(next.status);
          setSearchTerm(next.search);
          setPage(next.page);
        } catch (err) {
          const meta = formatApiError(err);
          setError(meta.message || 'Failed to load notifications.');
        }
      });
    },
    [pageSize],
  );

  const handleStatusChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value as FilterStatus;
      fetchData({ status: next, search: searchInput, page: 1 });
    },
    [fetchData, searchInput],
  );

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      fetchData({ status, search: searchInput, page: 1 });
    },
    [fetchData, searchInput, status],
  );

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    fetchData({ status, search: '', page: 1 });
  }, [fetchData, status]);

  const handleRefresh = useCallback(() => {
    fetchData({ status, search: searchTerm, page });
  }, [fetchData, page, searchTerm, status]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(nextPage, 1), pageCount);
      fetchData({ status, search: searchTerm, page: clamped });
    },
    [fetchData, pageCount, searchTerm, status],
  );

  const handleRequeue = useCallback(
    async (id: string) => {
      setLoadingId(id);
      setToast(null);
      try {
        const updated = await apiJSON<NotificationOutboxEntry>(
          `/notifications/outbox/${id}/requeue`,
          'POST',
        );
        setItems((prev) =>
          prev.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        setToast({
          tone: 'success',
          message: 'Notification requeued successfully.',
        });
      } catch (err) {
        const meta = formatApiError(err);
        setToast({
          tone: 'error',
          message: meta.message || 'Failed to requeue notification.',
        });
      } finally {
        setLoadingId(null);
      }
    },
    [],
  );

  const renderStatusBadge = (value: NotificationOutboxStatus) => {
    const palette: Record<NotificationOutboxStatus, string> = {
      PENDING: 'bg-amber-100 text-amber-800',
      SENT: 'bg-emerald-100 text-emerald-800',
      FAILED: 'bg-rose-100 text-rose-800',
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${palette[value]}`}
      >
        {titleCase(value)}
      </span>
    );
  };

  const renderChannelBadge = (value: NotificationOutboxEntry['channel']) => {
    const palette: Record<NotificationOutboxEntry['channel'], string> = {
      email: 'bg-blue-100 text-blue-800',
      sms: 'bg-purple-100 text-purple-800',
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${palette[value]}`}
      >
        {value.toUpperCase()}
      </span>
    );
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notification delivery log</h1>
          <p className="text-sm text-gray-600">
            Track pending, sent, and failed notifications. Requeue any failures for another attempt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={isPending}
          >
            {isPending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form className="flex flex-1 items-center gap-2" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            name="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by guest, code, or contact"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            autoComplete="off"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
            disabled={isPending}
          >
            Search
          </button>
          {searchTerm && (
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={handleClearSearch}
              disabled={isPending}
            >
              Clear
            </button>
          )}
        </form>
        <label className="text-sm text-gray-600">
          Status
          <select
            className="ml-2 rounded-lg border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={handleStatusChange}
            disabled={isPending}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option === 'ALL' ? 'All statuses' : titleCase(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(toast || error) && (
        <div className="mt-4 space-y-2">
          {toast && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                toast.tone === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {toast.message}
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="w-24 py-2">Status</th>
              <th className="w-24 py-2">Event</th>
              <th className="w-24 py-2">Channel</th>
              <th className="w-32 py-2">Guest</th>
              <th className="w-40 py-2">Contact</th>
              <th className="w-20 py-2 text-center">Attempts</th>
              <th className="w-40 py-2">Scheduled</th>
              <th className="w-40 py-2">Updated</th>
              <th className="py-2">Last error</th>
              <th className="w-32 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-sm text-gray-500">
                  No notifications found.
                </td>
              </tr>
            ) : (
              items.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-100 last:border-none">
                  <td className="py-3 align-top">{renderStatusBadge(entry.status)}</td>
                  <td className="py-3 align-top">{titleCase(entry.event)}</td>
                  <td className="py-3 align-top">{renderChannelBadge(entry.channel)}</td>
                  <td className="py-3 align-top">
                    <div className="font-medium text-gray-900">
                      {entry.reservation.guestName || 'Unknown guest'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {entry.reservation.code || '—'}
                    </div>
                  </td>
                  <td className="py-3 align-top">
                    <div className="text-gray-900">{entry.guestContact || '—'}</div>
                    {entry.reservation.slotLocalDate && (
                      <div className="text-xs text-gray-500">
                        {entry.reservation.slotLocalDate} {entry.reservation.slotLocalTime ?? ''}
                      </div>
                    )}
                  </td>
                  <td className="py-3 text-center align-top font-mono text-sm text-gray-700">
                    {entry.attempts}
                  </td>
                  <td className="py-3 align-top text-gray-800">
                    {formatDate(entry.scheduledAt)}
                  </td>
                  <td className="py-3 align-top text-gray-800">
                    {formatDate(entry.updatedAt)}
                  </td>
                  <td className="py-3 align-top text-xs text-rose-600">
                    {entry.lastError ? (
                      <span title={entry.lastError}>{entry.lastError}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 text-center align-top">
                    {entry.status === 'FAILED' ? (
                      <button
                        type="button"
                        onClick={() => void handleRequeue(entry.id)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loadingId === entry.id}
                      >
                        {loadingId === entry.id ? 'Requeuing…' : 'Requeue'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <div>
          Showing {(page - 1) * pageSize + 1}-
          {Math.min(page * pageSize, total)} of {total}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1 || isPending}
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= pageCount || isPending}
          >
            Next
          </button>
        </div>
      </footer>
    </section>
  );
}

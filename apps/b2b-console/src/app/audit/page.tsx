/* eslint-disable react/no-array-index-key */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, formatApiError } from '@/lib/api';
import type { AuditLogEntry, AuditLogListResponse } from '@/lib/types';

type Filters = {
  actor: string;
  action: string;
  resource: string;
  from: string;
  to: string;
  limit: string;
};

const DEFAULT_LIMIT = '25';

export default function AuditPage() {
  const [filters, setFilters] = useState<Filters>({
    actor: '',
    action: '',
    resource: '',
    from: '',
    to: '',
    limit: DEFAULT_LIMIT,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AuditLogListResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void fetchLogs(filters, { initial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalLabel = useMemo(() => {
    if (!response) return '';
    if (response.total === 0) return 'No activity recorded yet.';
    if (response.total === 1) return '1 audit event.';
    return `${response.total} audit events.`;
  }, [response]);

  async function fetchLogs(
    params: Filters,
    options: { initial?: boolean } = {},
  ) {
    if (options.initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const query = buildQuery(params);
      const data = await apiGet<AuditLogListResponse>(`/audit/logs${query}`);
      setResponse(data);
      if (!options.initial) {
        setFilters(params);
      }
    } catch (err) {
      const meta = formatApiError(err);
      setError(meta.message || 'Unable to fetch audit logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleInputChange<Key extends keyof Filters>(
    key: Key,
    value: Filters[Key],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void fetchLogs(filters);
  }

  async function handleRefresh() {
    void fetchLogs(filters);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Audit log</h1>
          <p className="text-sm text-gray-600">
            Track privacy actions, policy updates, and other sensitive operations.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          disabled={refreshing || loading}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <section className="mt-6 max-w-6xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <fieldset className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="actor">
              Actor
            </label>
            <input
              id="actor"
              type="text"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.actor}
              onChange={(event) => handleInputChange('actor', event.target.value)}
              placeholder="api-key:admin"
            />
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="action">
              Action
            </label>
            <input
              id="action"
              type="text"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.action}
              onChange={(event) => handleInputChange('action', event.target.value)}
              placeholder="privacy.export"
            />
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="resource">
              Resource
            </label>
            <input
              id="resource"
              type="text"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.resource}
              onChange={(event) =>
                handleInputChange('resource', event.target.value)
              }
              placeholder="guest:"
            />
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="from">
              From
            </label>
            <input
              id="from"
              type="datetime-local"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.from}
              onChange={(event) => handleInputChange('from', event.target.value)}
            />
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="to">
              To
            </label>
            <input
              id="to"
              type="datetime-local"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.to}
              onChange={(event) => handleInputChange('to', event.target.value)}
            />
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="limit">
              Limit
            </label>
            <input
              id="limit"
              type="number"
              min={1}
              max={200}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.limit}
              onChange={(event) => handleInputChange('limit', event.target.value)}
            />
          </fieldset>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Apply filters'}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 max-w-6xl">
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
            Loading audit events…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            {error}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 text-sm text-gray-600">
              <div>{totalLabel}</div>
              <div>Showing up to {filters.limit || DEFAULT_LIMIT} results.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 text-left">When</th>
                    <th className="px-6 py-3 text-left">Actor</th>
                    <th className="px-6 py-3 text-left">Action</th>
                    <th className="px-6 py-3 text-left">Resource</th>
                    <th className="px-6 py-3 text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {response?.items.length ? (
                    response.items.map((entry) => (
                      <AuditRow key={entry.id} entry={entry} />
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-4 text-center text-sm text-gray-500"
                      >
                        No audit entries match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  return (
    <tr className="bg-white">
      <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-gray-600">
        {new Date(entry.createdAt).toLocaleString()}
      </td>
      <td className="px-6 py-4 text-gray-900">{entry.actor}</td>
      <td className="px-6 py-4 text-gray-900">{entry.action}</td>
      <td className="px-6 py-4 font-mono text-xs text-gray-700">
        {entry.resource}
      </td>
      <td className="px-6 py-4 text-sm text-gray-700">
        <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-900">
            View payload
          </summary>
          <div className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
            <div>
              <div className="font-semibold text-gray-800">Before</div>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2">
                {formatJson(entry.before)}
              </pre>
            </div>
            <div>
              <div className="font-semibold text-gray-800">After</div>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2">
                {formatJson(entry.after)}
              </pre>
            </div>
          </div>
        </details>
      </td>
    </tr>
  );
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.actor.trim()) params.set('actor', filters.actor.trim());
  if (filters.action.trim()) params.set('action', filters.action.trim());
  if (filters.resource.trim()) params.set('resource', filters.resource.trim());
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.limit.trim()) params.set('limit', filters.limit.trim());
  const query = params.toString();
  return query ? `?${query}` : '';
}

function formatJson(payload: Record<string, unknown> | null): string {
  if (!payload || Object.keys(payload).length === 0) {
    return '—';
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

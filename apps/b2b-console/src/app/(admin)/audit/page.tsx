import Link from 'next/link';
import type { Metadata } from 'next';
import { serverGet } from '@/lib/serverApi';
import type { AuditLogEntry, AuditLogResponse } from '@/lib/types';

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const metadata: Metadata = {
  title: 'Audit Log',
};

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: PageProps) {
  const actor = getParam(searchParams, 'actor');
  const route = getParam(searchParams, 'route');
  const from = getParam(searchParams, 'from');
  const to = getParam(searchParams, 'to');
  const page = parsePositiveInt(getParam(searchParams, 'page')) ?? 1;

  const query = new URLSearchParams();
  if (actor) query.set('actor', actor);
  if (route) query.set('route', route);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (page > 1) query.set('page', String(page));

  const data = await serverGet<AuditLogResponse>(
    `/audit/logs?${query.toString()}`,
  );

  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = data.total > page * PAGE_SIZE ? page + 1 : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">
          Platform
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">Audit log</h1>
        <p className="text-sm text-gray-600">
          Inspect recent admin API activity without exposing request bodies.
        </p>
      </header>

      <form className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 text-sm">
          <label className="font-medium text-gray-700">Actor</label>
          <input
            type="text"
            name="actor"
            defaultValue={actor ?? ''}
            placeholder="api-key:..."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label className="font-medium text-gray-700">Route</label>
          <input
            type="text"
            name="route"
            defaultValue={route ?? ''}
            placeholder="/v1/privacy/..."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label className="font-medium text-gray-700">From</label>
          <input
            type="datetime-local"
            name="from"
            defaultValue={from ?? ''}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label className="font-medium text-gray-700">To</label>
          <input
            type="datetime-local"
            name="to"
            defaultValue={to ?? ''}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>
        <div className="md:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Request ID</th>
              <th className="px-4 py-3">Tenant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  No audit entries found for the selected filters.
                </td>
              </tr>
            ) : (
              data.items.map((entry) => (
                <tr key={`${entry.ts}-${entry.requestId ?? entry.actor}`}>
                  <td className="px-4 py-3 text-gray-900">
                    {new Date(entry.ts).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{entry.actor}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <code className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs">
                      {entry.route ?? '—'}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {entry.method ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {entry.requestId ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {entry.tenantId ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Showing {(page - 1) * PAGE_SIZE + 1}-
          {Math.min(page * PAGE_SIZE, data.total)} of {data.total}
        </span>
        <div className="flex gap-2">
          <PagerLink label="Previous" page={prevPage} params={searchParams} />
          <PagerLink label="Next" page={nextPage} params={searchParams} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AuditLogEntry['status'] }) {
  if (!status) {
    return <span className="text-gray-500">—</span>;
  }
  const color =
    status >= 500
      ? 'bg-rose-100 text-rose-800'
      : status >= 400
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}
    >
      {status}
    </span>
  );
}

function PagerLink({
  label,
  page,
  params,
}: {
  label: string;
  page: number | null;
  params?: PageProps['searchParams'];
}) {
  if (!page) {
    return (
      <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-400">
        {label}
      </span>
    );
  }
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && key !== 'page') {
        query.set(key, value);
      }
    }
  }
  if (page > 1) {
    query.set('page', String(page));
  }
  const href = `/audit${query.toString() ? `?${query.toString()}` : ''}`;
  return (
    <Link
      href={href}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
    >
      {label}
    </Link>
  );
}

function parsePositiveInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function getParam(
  params: PageProps['searchParams'],
  key: string,
): string | undefined {
  const raw = params?.[key];
  return typeof raw === 'string' ? raw : undefined;
}

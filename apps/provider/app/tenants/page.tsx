import Link from 'next/link';
import { apiGet } from '../../src/lib/api';
import type { TenantSummary } from '../../src/lib/types';

type VenuesResponse = {
  items: TenantSummary[];
  total?: number;
};

function safeGet<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

export default async function TenantsPage() {
  const venues = await safeGet(apiGet<VenuesResponse>('/v1/market/venues'), { items: [] });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Tenants & Venues</h1>
        <p className="text-sm text-slate-600">
          Review venues connected to your provider integration. Manage configuration in the admin console.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Venue</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {venues.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  No venues found.
                </td>
              </tr>
            ) : (
              venues.items.map((venue) => (
                <tr key={venue.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-900">{venue.name}</div>
                    <div className="text-xs text-slate-500">{venue.slug ?? '—'}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{venue.city ?? '—'}</td>
                  <td className="px-4 py-4 text-slate-700">{venue.country ?? '—'}</td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`http://localhost:3001/venues/${venue.id}/settings`}
                      className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Open in admin
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

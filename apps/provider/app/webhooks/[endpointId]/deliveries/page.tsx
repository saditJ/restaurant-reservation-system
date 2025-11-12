import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGet, apiPost } from '../../../src/lib/api';
import type {
  WebhookDelivery,
  WebhookDeliveryListResponse,
  WebhookEndpoint,
  WebhookSecretResponse,
} from '../../../src/lib/types';

type PageProps = {
  params: { endpointId: string };
  searchParams?: { page?: string };
};

const PAGE_SIZE = 25;

async function fetchEndpoints() {
  return apiGet<WebhookEndpoint[]>('/v1/webhooks/endpoints');
}

async function fetchDeliveries(endpointId: string, page: number) {
  const query = new URLSearchParams({
    endpointId,
    page: page.toString(),
    limit: PAGE_SIZE.toString(),
  });
  return apiGet<WebhookDeliveryListResponse>(
    `/v1/webhooks/deliveries?${query.toString()}`,
  );
}

async function fetchSecretPreview(endpointId: string) {
  return apiGet<WebhookSecretResponse>(
    `/v1/webhooks/secret?endpointId=${encodeURIComponent(endpointId)}`,
  );
}

async function redeliverDeliveryAction(formData: FormData) {
  'use server';
  const deliveryId = String(formData.get('deliveryId') ?? '').trim();
  const redirectPath = String(formData.get('redirectPath') ?? '').trim();
  if (!deliveryId) {
    throw new Error('deliveryId is required');
  }
  await apiPost(`/v1/webhooks/deliveries/${deliveryId}/redeliver`);
  if (redirectPath) {
    revalidatePath(redirectPath);
  } else {
    revalidatePath('/webhooks');
  }
}

export default async function WebhookDeliveriesPage({
  params,
  searchParams,
}: PageProps) {
  const endpointId = params.endpointId;
  const page =
    searchParams?.page && Number.isFinite(Number(searchParams.page))
      ? Math.max(1, Number(searchParams.page))
      : 1;

  const [endpoints, deliveries, secretPreview] = await Promise.all([
    fetchEndpoints(),
    fetchDeliveries(endpointId, page),
    fetchSecretPreview(endpointId).catch(() => null),
  ]);

  const endpoint = endpoints.find((item) => item.id === endpointId);
  if (!endpoint) {
    notFound();
  }
  const nextPage =
    deliveries.total > page * PAGE_SIZE ? page + 1 : undefined;
  const prevPage = page > 1 ? page - 1 : undefined;
  const redirectPath = `/webhooks/${endpointId}/deliveries${
    page > 1 ? `?page=${page}` : ''
  }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Webhooks
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Deliveries for{' '}
            <span className="text-slate-600">{endpoint.url}</span>
          </h1>
          <p className="text-sm text-slate-600">
            Secret ending with{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              {secretPreview?.lastFour ?? '????'}
            </code>
          </p>
        </div>
        <Link
          href="/webhooks"
          className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Back to webhooks
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Last attempt</th>
              <th className="px-4 py-3">Next attempt</th>
              <th className="px-4 py-3">Last error</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deliveries.items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-sm text-slate-500"
                >
                  No deliveries found.
                </td>
              </tr>
            ) : (
              deliveries.items.map((delivery) => (
                <tr key={delivery.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-900">
                      {delivery.event.replace('reservation.', '')}
                    </div>
                    <div className="text-xs text-slate-500">
                      {delivery.payload.reservation.code}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={delivery.status} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-900">
                      {delivery.attempts}
                    </div>
                    <div className="text-xs text-slate-500">
                      {delivery.failureReason
                        ? 'Final failure'
                        : 'Retry scheduled'}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {new Date(delivery.lastAttemptAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {delivery.deliveredAt
                      ? '—'
                      : new Date(delivery.nextAttemptAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs text-slate-600">
                      {delivery.failureReason ?? delivery.lastError ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <form action={redeliverDeliveryAction} className="inline">
                      <input
                        type="hidden"
                        name="deliveryId"
                        value={delivery.id}
                      />
                      <input
                        type="hidden"
                        name="redirectPath"
                        value={redirectPath}
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Redeliver
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <div>
          Showing {(page - 1) * PAGE_SIZE + 1}-
          {Math.min(page * PAGE_SIZE, deliveries.total)} of {deliveries.total}
        </div>
        <div className="flex gap-2">
          <PaginationLink
            endpointId={endpointId}
            page={prevPage}
            direction="Previous"
          />
          <PaginationLink
            endpointId={endpointId}
            page={nextPage}
            direction="Next"
          />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: WebhookDelivery['status'] }) {
  const styles: Record<
    WebhookDelivery['status'],
    { bg: string; text: string }
  > = {
    SUCCESS: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
    PENDING: { bg: 'bg-amber-100', text: 'text-amber-800' },
    FAILED: { bg: 'bg-rose-100', text: 'text-rose-800' },
  };
  const style = styles[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function PaginationLink({
  endpointId,
  page,
  direction,
}: {
  endpointId: string;
  page?: number;
  direction: 'Previous' | 'Next';
}) {
  if (!page) {
    return (
      <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-400">
        {direction}
      </span>
    );
  }
  const href =
    page === 1
      ? `/webhooks/${endpointId}/deliveries`
      : `/webhooks/${endpointId}/deliveries?page=${page}`;
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
    >
      {direction}
    </Link>
  );
}

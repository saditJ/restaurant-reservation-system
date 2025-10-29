
'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { ApiError } from '@reserve/sdk';
import type { WebhookDelivery, WebhookDeliveryList, WebhookEndpoint } from '@reserve/sdk';
import { createBrowserSdk } from '@/lib/sdk';

type Props = {
  initialEndpoints: WebhookEndpoint[];
  initialDeliveries: WebhookDeliveryList;
  secret: string;
};

const sdk = createBrowserSdk();

export default function WebhooksDeveloperClient({
  initialEndpoints,
  initialDeliveries,
  secret,
}: Props) {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>(initialEndpoints);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryList>(initialDeliveries);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('all');
  const [formUrl, setFormUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [redeliverBusy, setRedeliverBusy] = useState<Record<string, boolean>>({});
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const exampleCommand = useMemo(() => buildCurlExample(secret), [secret]);

  const loadDeliveries = useCallback(
    async (endpointId?: string) => {
      setDeliveryError(null);
      startRefreshTransition(() => {
        void sdk.webhooks
          .listDeliveries({
            limit: 20,
            endpointId: endpointId && endpointId !== 'all' ? endpointId : undefined,
          })
          .then((next) => {
            setDeliveries(next);
          })
          .catch((error: unknown) => {
            setDeliveryError(parseError(error, 'Failed to load deliveries'));
          });
      });
    },
    [],
  );

  const handleCreateEndpoint = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!formUrl.trim()) {
        setFormError('Endpoint URL is required');
        return;
      }
      setIsSubmitting(true);
      setFormError(null);
      try {
        const endpoint = await sdk.webhooks.createEndpoint({
          url: formUrl.trim(),
          description: formDescription.trim() || undefined,
        });
        setEndpoints((prev) => [endpoint, ...prev]);
        setFormUrl('');
        setFormDescription('');
      } catch (error) {
        setFormError(parseError(error, 'Failed to create webhook endpoint'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [formUrl, formDescription],
  );

  const handleFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setSelectedEndpointId(value);
      void loadDeliveries(value === 'all' ? undefined : value);
    },
    [loadDeliveries],
  );

  const handleRedeliver = useCallback(async (delivery: WebhookDelivery) => {
    setRedeliverBusy((state) => ({ ...state, [delivery.id]: true }));
    try {
      await sdk.webhooks.redeliver(delivery.id);
      await loadDeliveries(selectedEndpointId === 'all' ? undefined : selectedEndpointId);
    } catch (error) {
      setDeliveryError(parseError(error, 'Failed to schedule redelivery'));
    } finally {
      setRedeliverBusy((state) => {
        const next = { ...state };
        delete next[delivery.id];
        return next;
      });
    }
  }, [loadDeliveries, selectedEndpointId]);

  const handleCopySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      console.warn('Failed to copy webhook secret', error);
    }
  }, [secret]);

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-gray-500">Webhooks</p>
        <h1 className="text-3xl font-semibold text-gray-900">Developer access</h1>
        <p className="text-sm text-gray-600">
          Register webhook consumers, inspect recent deliveries, and requeue failed attempts. Webhooks
          are signed with an HMAC using your shared secret.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Signing secret</h2>
              <p className="text-sm text-gray-600">
                Every webhook is signed with <code className="rounded bg-gray-100 px-1 py-0.5">sha256</code> HMAC
                using this secret.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopySecret}
              className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {copyState === 'copied' ? 'Copied' : 'Copy secret'}
            </button>
          </div>
          <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900 break-all">
            {secret}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Verify signature locally</p>
            <p className="mt-1 text-sm text-gray-600">
              Use this snippet to replay a payload and confirm signature verification in your integration.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-gray-900 p-4 text-xs text-gray-100 leading-relaxed">
{exampleCommand}
            </pre>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Register endpoint</h2>
          <p className="text-sm text-gray-600">
            Provide an HTTPS URL that accepts <code className="rounded bg-gray-100 px-1 py-0.5">POST</code> requests.
            We recommend returning <code className="rounded bg-gray-100 px-1 py-0.5">200 OK</code> once the signature
            is verified.
          </p>
          <form onSubmit={handleCreateEndpoint} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Endpoint URL</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                placeholder="https://example.com/webhooks/reservations"
                value={formUrl}
                onChange={(event) => {
                  setFormUrl(event.target.value);
                  setFormError(null);
                }}
                required
                type="url"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Description (optional)</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                placeholder="Staging ingestion service"
                value={formDescription}
                maxLength={255}
                onChange={(event) => setFormDescription(event.target.value)}
              />
            </label>
            {formError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
            >
              {isSubmitting ? 'Registering...' : 'Register endpoint'}
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Endpoints</h2>
            <p className="text-sm text-gray-600">
              Manage destinations and track when each endpoint was created.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {endpoints.length} endpoint{endpoints.length === 1 ? '' : 's'}
          </span>
        </div>
        {endpoints.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
            No webhook endpoints registered yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">URL</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {endpoints.map((endpoint) => (
                  <tr key={endpoint.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-gray-900">{endpoint.url}</td>
                    <td className="px-4 py-2 text-gray-700">{endpoint.description ?? 'n/a'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          endpoint.isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {endpoint.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {formatRelative(endpoint.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent deliveries</h2>
            <p className="text-sm text-gray-600">
              Track recent webhook attempts, inspect failures, and trigger manual retries.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">
              <span className="sr-only">Filter by endpoint</span>
              <select
                value={selectedEndpointId}
                onChange={handleFilterChange}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="all">All endpoints</option>
                {endpoints.map((endpoint) => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.description ? `${endpoint.description} (${endpoint.url})` : endpoint.url}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                loadDeliveries(selectedEndpointId === 'all' ? undefined : selectedEndpointId)
              }
              className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        {deliveryError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {deliveryError}
          </p>
        )}
        {deliveries.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
            No deliveries recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Endpoint</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Attempts</th>
                  <th className="px-4 py-2">Last update</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deliveries.items.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-2 text-gray-900">
                      <p className="font-medium">{delivery.event}</p>
                      <p className="text-xs text-gray-600">ID: {delivery.id}</p>
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {delivery.endpoint?.description ? (
                        <>
                          <p>{delivery.endpoint.description}</p>
                          <p className="font-mono text-xs text-gray-500">{delivery.endpoint.url}</p>
                        </>
                      ) : (
                        <p className="font-mono text-xs text-gray-500">{delivery.endpoint?.url ?? 'n/a'}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={delivery.status} />
                      {delivery.lastError && (
                        <p className="mt-1 max-w-xs text-xs text-rose-600">{delivery.lastError}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{delivery.attempts}</td>
                    <td className="px-4 py-2 text-gray-600">{formatRelative(delivery.updatedAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={redeliverBusy[delivery.id]}
                        onClick={() => void handleRedeliver(delivery)}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {redeliverBusy[delivery.id] ? 'Requeueing...' : 'Redeliver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function parseError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatRelative(iso: string) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const diffMs = instant.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return formatter.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, 'day');
}

function StatusBadge({ status }: { status: WebhookDelivery['status'] }) {
  switch (status) {
    case 'SUCCESS':
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          Delivered
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
          Pending
        </span>
      );
  }
}

function buildCurlExample(secret: string) {
  const payload = JSON.stringify(
    {
      id: 'evt_test_123',
      event: 'reservation.created',
      attempt: 1,
      createdAt: '2025-01-01T12:00:00.000Z',
      data: {
        reservation: {
          id: 'res_demo_123',
          code: 'RABC123',
          status: 'CONFIRMED',
        },
      },
    },
    null,
    2,
  );

  const payloadEscaped = payload.replace(/`/g, '\\`');
  return [
    "export WEBHOOK_SECRET='" + secret.replace(/'/g, `'\\''`) + "'",
    'timestamp=$(date -u +%s)',
    `payload='${payloadEscaped.replace(/'/g, `'\\''`)}'`,
    'signature=$(printf "%s.%s" "$timestamp" "$payload" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | xxd -p -c 256)',
    'curl -X POST https://your-app.example/webhooks \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "X-Reserve-Timestamp: $timestamp" \\',
    '  -H "X-Reserve-Signature: t=$timestamp,v1=$signature" \\',
    '  -d "$payload"',
  ].join('\n');
}



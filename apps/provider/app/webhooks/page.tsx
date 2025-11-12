import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { apiGet, apiPost } from '../../src/lib/api';
import {
  RESERVATION_WEBHOOK_EVENTS,
  type ReservationWebhookEvent,
  type WebhookEndpoint,
} from '../../src/lib/types';
import { CreateEndpointForm } from './CreateEndpointForm';

type FormState = {
  ok: boolean;
  error?: string;
  secret?: string | null;
  endpointId?: string;
};

const EVENT_LABELS: Record<
  ReservationWebhookEvent,
  { label: string; description: string }
> = {
  'reservation.created': {
    label: 'Reservation created',
    description: 'Fires when a new reservation is confirmed.',
  },
  'reservation.updated': {
    label: 'Reservation updated',
    description: 'Sent when details change (time, party, guest info).',
  },
  'reservation.cancelled': {
    label: 'Reservation cancelled',
    description: 'Occurs when a guest or staff member cancels.',
  },
  'reservation.seated': {
    label: 'Reservation seated',
    description: 'Emitted when the party is marked as seated.',
  },
  'reservation.completed': {
    label: 'Reservation completed',
    description: 'Delivered after the visit is completed and closed.',
  },
};

const EVENT_OPTIONS = RESERVATION_WEBHOOK_EVENTS.map((value) => ({
  value,
  label: EVENT_LABELS[value].label,
  description: EVENT_LABELS[value].description,
}));

async function fetchEndpoints() {
  return apiGet<WebhookEndpoint[]>('/v1/webhooks/endpoints');
}

async function createEndpointAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  'use server';
  const url = String(formData.get('url') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const events = formData
    .getAll('events')
    .map((value) => String(value).trim())
    .filter(Boolean) as ReservationWebhookEvent[];

  if (!url) {
    return { ok: false, error: 'Endpoint URL is required.' };
  }

  try {
    const endpoint = await apiPost<WebhookEndpoint>('/v1/webhooks/endpoints', {
      url,
      description: description || undefined,
      events: events.length ? events : undefined,
    });
    revalidatePath('/webhooks');
    return {
      ok: true,
      secret: endpoint.secret ?? null,
      endpointId: endpoint.id,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create webhook endpoint',
    };
  }
}

export default async function WebhooksPage() {
  const endpoints = await fetchEndpoints();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Integrations
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">Webhooks</h1>
        <p className="text-sm text-slate-600">
          Configure delivery targets for reservation lifecycle events and
          inspect recent attempts.
        </p>
      </header>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Create endpoint
          </h2>
          <p className="text-sm text-slate-600">
            A random signing secret is generated for every endpoint. Store it
            securely—only the last four characters are shown after creation.
          </p>
        </div>
        <CreateEndpointForm
          action={createEndpointAction}
          eventOptions={EVENT_OPTIONS}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">
            Configured endpoints
          </h2>
          <p className="text-sm text-slate-600">
            Each endpoint receives a deterministic HMAC signature header:
            <code className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-white">
              X-Webhook-Signature: sha256=&lt;hex&gt;
            </code>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Secret</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {endpoints.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No webhook endpoints configured yet.
                  </td>
                </tr>
              ) : (
                endpoints.map((endpoint) => (
                  <tr key={endpoint.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">
                        {endpoint.url}
                      </div>
                      <div className="text-xs text-slate-500">
                        {endpoint.description ?? 'No description'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {endpoint.events.map((event) => (
                          <span
                            key={event}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                          >
                            {EVENT_LABELS[event].label.replace('Reservation ', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {endpoint.secretPreview ? (
                        <span>
                          ••••
                          {endpoint.secretPreview.lastFour}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {new Date(endpoint.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/webhooks/${endpoint.id}/deliveries`}
                        className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Deliveries
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Verify signatures
        </h2>
        <p className="text-sm text-slate-600">
          Every payload is signed with the endpoint secret using HMAC SHA-256
          and sent in{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
            X-Webhook-Signature
          </code>
          . Compare this hash with one you compute locally before processing
          the event.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-slate-950/95 p-4 text-xs text-slate-100">
          <code>{`import crypto from 'node:crypto';

export function verifySignature(body: string, signatureHeader: string, secret: string) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const actual = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(actual, 'hex'),
    );
  } catch {
    return false;
  }
}`}</code>
        </pre>
      </section>
    </div>
  );
}

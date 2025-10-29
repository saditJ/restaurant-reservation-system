import { notFound } from 'next/navigation';
import type { ApiError, ApiKeyList, WebhookDeliveryList, WebhookEndpoint } from '@reserve/sdk';
import { createServerSdk } from '@/lib/sdk';
import ApiKeysClient from './api-keys-client';
import WebhooksDeveloperClient from './webhooks-client';

export const revalidate = 0;

type SecretLookup = { secret: string | null; error?: unknown };
export default async function DeveloperSettingsPage() {
  const sdk = createServerSdk();

  const apiKeys: ApiKeyList = await sdk.apiKeys
    .list()
    .catch(() => ({ items: [] }));

  const secretResult: SecretLookup = await sdk.webhooks
    .getSecret()
    .then((value) => ({ secret: value.secret }))
    .catch((error: unknown) => ({ secret: null, error }));

  if (!secretResult.secret) {
    if (isApiError(secretResult.error)) {
      if (secretResult.error.status === 400) {
        return (
          <div className="space-y-10">
            <ApiKeysClient initialKeys={apiKeys.items} />
            <section className="space-y-6">
              <header className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Webhooks</p>
                <h1 className="text-3xl font-semibold text-gray-900">Developer access</h1>
                <p className="text-sm text-gray-600">
                  Configure <code className="rounded bg-gray-100 px-1 py-0.5">WEBHOOK_SECRET</code> in the API
                  service to enable webhook delivery and signing.
                </p>
              </header>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                <p className="font-medium">Webhook secret not configured</p>
                <p className="mt-2 leading-relaxed">
                  Set the <code className="rounded bg-amber-100 px-1 py-0.5">WEBHOOK_SECRET</code> environment variable
                  for the API service, restart the API, then refresh this page to manage webhooks.
                </p>
              </div>
            </section>
          </div>
        );
      }
      if (secretResult.error) {
        throw secretResult.error;
      }
    }
    notFound();
  }

  const endpoints: WebhookEndpoint[] = await sdk.webhooks.listEndpoints().catch((error: unknown) => {
    if (isApiError(error) && error.status === 404) {
      return [];
    }
    throw error;
  });

  const deliveriesResult: WebhookDeliveryList = await sdk.webhooks
    .listDeliveries({ limit: 20 })
    .catch((error: unknown) => {
      if (isApiError(error) && error.status === 404) {
        return { items: [], total: 0 };
      }
      throw error;
    });

  return (
    <div className="space-y-10">
      <ApiKeysClient initialKeys={apiKeys.items} />
      <WebhooksDeveloperClient
        initialEndpoints={endpoints}
        initialDeliveries={deliveriesResult}
        secret={secretResult.secret}
      />
    </div>
  );
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(error && typeof error === 'object' && 'status' in error);
}


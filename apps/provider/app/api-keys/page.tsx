import { revalidatePath } from 'next/cache';
import { apiGet, apiPatch, apiPost } from '../../src/lib/api';
import type {
  ApiKeyListResponse,
  ProviderUsageListResponse,
  ProviderUsageKey,
} from '../../src/lib/types';

function toNumber(value: FormDataEntryValue | null, fallback: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function loadData() {
  const [keys, usage] = await Promise.all([
    apiGet<ApiKeyListResponse>('/v1/admin/api-keys'),
    apiGet<ProviderUsageListResponse>('/v1/provider/usage/keys'),
  ]);
  const usageMap = new Map<string, ProviderUsageKey>();
  usage.items.forEach((item) => usageMap.set(item.apiKeyId, item));
  return { keys: keys.items, usageMap };
}

export default async function ApiKeysPage() {
  const { keys, usageMap } = await loadData();

  async function createKey(formData: FormData) {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    const tenantId = String(formData.get('tenantId') ?? '').trim();
    const rateLimitPerMin = toNumber(formData.get('rateLimitPerMin'), 60);
    const burstLimit = toNumber(formData.get('burstLimit'), rateLimitPerMin * 2);
    const monthlyCap = toNumber(formData.get('monthlyCap'), 500_000);

    if (!name) return;
    await apiPost('/v1/admin/api-keys', {
      name,
      tenantId: tenantId || undefined,
      rateLimitPerMin,
      burstLimit,
      monthlyCap,
      scopes: ['provider', 'admin'],
    });
    revalidatePath('/api-keys');
  }

  async function rotateKey(formData: FormData) {
    'use server';
    const id = String(formData.get('id') ?? '');
    if (!id) return;
    await apiPost(`/v1/admin/api-keys/${encodeURIComponent(id)}/rotate`);
    revalidatePath('/api-keys');
  }

  async function disableKey(formData: FormData) {
    'use server';
    const id = String(formData.get('id') ?? '');
    if (!id) return;
    await apiPost(`/v1/admin/api-keys/${encodeURIComponent(id)}/disable`);
    revalidatePath('/api-keys');
  }

  async function updateKey(formData: FormData) {
    'use server';
    const id = String(formData.get('id') ?? '');
    if (!id) return;
    const rateLimitPerMin = toNumber(formData.get('rateLimitPerMin'), 60);
    const burstLimit = toNumber(formData.get('burstLimit'), rateLimitPerMin * 2);
    const monthlyCap = toNumber(formData.get('monthlyCap'), 500_000);
    await apiPatch(`/v1/admin/api-keys/${encodeURIComponent(id)}`, {
      rateLimitPerMin,
      burstLimit,
      monthlyCap,
    });
    revalidatePath('/api-keys');
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">API Keys</h1>
        <p className="text-sm text-slate-600">
          Manage integration keys, rotate secrets, and monitor quotas.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create key</h2>
        <p className="text-sm text-slate-600">
          Keys are provisioned with provider + admin scopes for dashboard access.
        </p>
        <form action={createKey} className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Name</span>
            <input
              name="name"
              required
              placeholder="Integration name"
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Tenant (optional)</span>
            <input
              name="tenantId"
              placeholder="tenant-main"
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Requests/minute</span>
            <input
              name="rateLimitPerMin"
              type="number"
              min={1}
              defaultValue={60}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Burst</span>
            <input
              name="burstLimit"
              type="number"
              min={1}
              defaultValue={120}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">Monthly cap</span>
            <input
              name="monthlyCap"
              type="number"
              min={50000}
              defaultValue={500000}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Create key
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Existing keys</h2>
        <div className="space-y-4">
          {keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No keys yet. Use the form above to create one.
            </div>
          ) : (
            keys.map((key) => {
              const usage = usageMap.get(key.id);
              const monthlyCap = usage?.monthlyCap ?? key.monthlyCap;
              const used = usage?.usedThisMonth ?? 0;
              const remaining = Math.max(monthlyCap - used, 0);
              return (
                <div
                  key={key.id}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{key.name}</div>
                      <div className="text-xs text-slate-500">
                        {key.id} • Tenant {key.tenantId} • Scopes {key.scopes.join(', ')}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={rotateKey}>
                        <input type="hidden" name="id" value={key.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Rotate secret
                        </button>
                      </form>
                      <form action={disableKey}>
                        <input type="hidden" name="id" value={key.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Disable
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-4 text-sm text-slate-700">
                    <div>
                      <span className="block text-xs uppercase text-slate-500">Monthly cap</span>
                      <span className="font-medium text-slate-900">
                        {monthlyCap ? monthlyCap.toLocaleString() : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase text-slate-500">Used this month</span>
                      <span className="font-medium text-slate-900">
                        {used.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase text-slate-500">Remaining</span>
                      <span className="font-medium text-slate-900">
                        {remaining.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase text-slate-500">24h allows</span>
                      <span className="font-medium text-slate-900">
                        {key.usage.allows24h.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <form action={updateKey} className="grid gap-4 sm:grid-cols-4">
                    <input type="hidden" name="id" value={key.id} />
                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Requests/minute</span>
                      <input
                        name="rateLimitPerMin"
                        type="number"
                        min={1}
                        defaultValue={key.rateLimitPerMin}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Burst</span>
                      <input
                        name="burstLimit"
                        type="number"
                        min={1}
                        defaultValue={key.burstLimit}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Monthly cap</span>
                      <input
                        name="monthlyCap"
                        type="number"
                        min={50000}
                        defaultValue={key.monthlyCap}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Save limits
                      </button>
                    </div>
                  </form>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

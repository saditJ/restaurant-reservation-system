import { apiGet } from '../src/lib/api';
import type {
  ProviderUsageListResponse,
  ProviderUsageTimeseriesResponse,
  ProviderUsageKey,
} from '../src/lib/types';
import { UsageChart } from '../src/components/UsageChart';

export const revalidate = 0;

async function fetchUsage() {
  return apiGet<ProviderUsageListResponse>('/v1/provider/usage/keys');
}

async function fetchTimeseries(keyId: string) {
  return apiGet<ProviderUsageTimeseriesResponse>(
    `/v1/provider/usage/keys/${encodeURIComponent(keyId)}/timeseries?days=30`,
  );
}

function StatsCard({ title, value, description }: { title: string; value: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return '0%';
  const pct = Math.min((value / total) * 100, 999);
  return `${pct.toFixed(1)}%`;
}

function renderKeyRow(item: ProviderUsageKey) {
  const remaining = Math.max(item.monthlyCap - item.usedThisMonth, 0);
  const pct = formatPercent(item.usedThisMonth, item.monthlyCap);
  return (
    <div
      key={item.apiKeyId}
      className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-5"
    >
      <div className="font-medium text-slate-900">
        <span className="block text-xs uppercase text-slate-500">Key</span>
        {item.apiKeyId}
      </div>
      <div>
        <span className="block text-xs uppercase text-slate-500">Monthly usage</span>
        <span className="font-medium text-slate-900">
          {item.usedThisMonth.toLocaleString()} / {item.monthlyCap.toLocaleString()}
        </span>
        <span className="ml-2 text-xs text-slate-500">{pct}</span>
      </div>
      <div>
        <span className="block text-xs uppercase text-slate-500">Remaining</span>
        <span className="font-medium text-slate-900">{remaining.toLocaleString()}</span>
      </div>
      <div>
        <span className="block text-xs uppercase text-slate-500">Rate</span>
        <span className="font-medium text-slate-900">{item.rps.toFixed(1)} rps</span>
      </div>
      <div>
        <span className="block text-xs uppercase text-slate-500">Burst</span>
        <span className="font-medium text-slate-900">{item.burst.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const usage = await fetchUsage();
  const [primaryKey] = usage.items;
  const timeseries = primaryKey ? await fetchTimeseries(primaryKey.apiKeyId) : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Track API consumption and quotas across provider keys.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active keys"
          value={usage.total.toString()}
          description="Keys reporting usage this month"
        />
        <StatsCard
          title="Total requests (30d)"
          value={
            timeseries ? timeseries.sum.toLocaleString() : usage.items.reduce((acc, item) => acc + item.usedThisMonth, 0).toLocaleString()
          }
        />
        <StatsCard
          title="Top key usage"
          value={primaryKey ? primaryKey.usedThisMonth.toLocaleString() : '0'}
          description={primaryKey ? `Key ${primaryKey.apiKeyId}` : undefined}
        />
        <StatsCard
          title="Average RPS limit"
          value={
            usage.items.length
              ? (usage.items.reduce((acc, item) => acc + item.rps, 0) / usage.items.length).toFixed(1)
              : '0.0'
          }
          description="Across provisioned keys"
        />
      </section>

      {timeseries ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Usage trend</h2>
            <p className="text-sm text-slate-600">
              Daily request volume for <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{primaryKey.apiKeyId}</code>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <UsageChart data={timeseries.points} />
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Key overview</h2>
          <p className="text-sm text-slate-600">Monitor quotas and rate limits per integration key.</p>
        </div>
        <div className="space-y-3">
          {usage.items.length ? (
            usage.items.map((item) => renderKeyRow(item))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No API keys found. Create one from the API Keys section.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

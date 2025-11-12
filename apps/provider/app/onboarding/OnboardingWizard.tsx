'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  OnboardingApiKeyResponse,
  OnboardingShiftsResponse,
  OnboardingTablesResponse,
  OnboardingTenantResponse,
  OnboardingVenueResponse,
} from '../../src/lib/types';

type WizardStep = 'tenant' | 'venue' | 'shifts' | 'tables' | 'apikey';
type StepStatus = 'idle' | 'saving' | 'success' | 'error';

type TenantState = {
  name: string;
  city: string;
  tz: string;
  tenantId?: string;
  created?: boolean;
  status: StepStatus;
  error?: string;
  completed: boolean;
};

type VenueState = {
  name: string;
  city: string;
  tz: string;
  tenantId?: string;
  venueId?: string;
  created?: boolean;
  status: StepStatus;
  error?: string;
  completed: boolean;
};

type ShiftsState = {
  venueId?: string;
  template: 'restaurant' | 'bar' | 'cafe';
  status: StepStatus;
  error?: string;
  created: number;
  updated: number;
  completed: boolean;
};

type TablesState = {
  venueId?: string;
  rows: number;
  cols: number;
  min: number;
  max: number;
  created: number;
  updated: number;
  status: StepStatus;
  error?: string;
  completed: boolean;
};

type ApiKeyState = {
  tenantId?: string;
  apiKeyId?: string;
  maskedKey?: string | null;
  plaintextKey?: string | null;
  rps: number;
  burst: number;
  monthlyCap: number;
  reused: boolean;
  status: StepStatus;
  error?: string;
  completed: boolean;
};

const STEPS: Array<{ id: WizardStep; title: string; description: string }> = [
  { id: 'tenant', title: 'Tenant', description: 'Create the partner shell' },
  { id: 'venue', title: 'Venue', description: 'Add their first location' },
  { id: 'shifts', title: 'Shifts', description: 'Seed trading hours' },
  { id: 'tables', title: 'Tables', description: 'Generate a floor grid' },
  { id: 'apikey', title: 'API Key', description: 'Provision access' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Tirane',
  'Europe/Berlin',
  'Asia/Singapore',
  'Asia/Tokyo',
  'UTC',
] as const;

const SNIPPET_BASE =
  process.env.NEXT_PUBLIC_API_SNIPPET_BASE ?? 'https://api.reserve.test';

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('tenant');
  const [tenant, setTenant] = useState<TenantState>({
    name: '',
    city: '',
    tz: 'America/New_York',
    status: 'idle',
    completed: false,
  });
  const [venue, setVenue] = useState<VenueState>({
    name: '',
    city: '',
    tz: 'America/New_York',
    status: 'idle',
    completed: false,
  });
  const [shifts, setShifts] = useState<ShiftsState>({
    template: 'restaurant',
    created: 0,
    updated: 0,
    status: 'idle',
    completed: false,
  });
  const [tables, setTables] = useState<TablesState>({
    rows: 3,
    cols: 4,
    min: 2,
    max: 4,
    created: 0,
    updated: 0,
    status: 'idle',
    completed: false,
  });
  const [apiKey, setApiKey] = useState<ApiKeyState>({
    rps: 60,
    burst: 120,
    monthlyCap: 500_000,
    reused: false,
    status: 'idle',
    completed: false,
  });

  const canVisitStep = useCallback(
    (step: WizardStep) => {
      if (step === 'tenant') return true;
      if (step === 'venue') return Boolean(tenant.tenantId);
      if (step === 'shifts') return Boolean(venue.venueId);
      if (step === 'tables') return Boolean(shifts.completed);
      if (step === 'apikey') return Boolean(tables.completed);
      return false;
    },
    [tenant.tenantId, venue.venueId, shifts.completed, tables.completed],
  );

  const goToStep = useCallback(
    (step: WizardStep) => {
      if (canVisitStep(step)) {
        setCurrentStep(step);
      }
    },
    [canVisitStep],
  );

  const postJson = useCallback(async <T,>(path: string, payload: unknown) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data?.error as string) ?? 'Request failed');
    }
    return data as T;
  }, []);

  const handleTenantSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setTenant((prev) => ({ ...prev, status: 'saving', error: undefined }));
      try {
        const result = await postJson<OnboardingTenantResponse>(
          '/api/provider-onboarding/tenant',
          { name: tenant.name, city: tenant.city, tz: tenant.tz },
        );
        setTenant((prev) => ({
          ...prev,
          tenantId: result.tenantId,
          created: result.created,
          status: 'success',
          completed: true,
        }));
        setVenue((prev) => ({
          ...prev,
          tenantId: result.tenantId,
          city: prev.city || tenant.city,
          tz: prev.tz || tenant.tz,
        }));
        goToStep('venue');
      } catch (error) {
        setTenant((prev) => ({
          ...prev,
          status: 'error',
          error: (error as Error).message,
        }));
      }
    },
    [tenant.name, tenant.city, tenant.tz, postJson, goToStep],
  );

  const handleVenueSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!tenant.tenantId) {
        setVenue((prev) => ({
          ...prev,
          status: 'error',
          error: 'Complete tenant details first.',
        }));
        return;
      }
      setVenue((prev) => ({ ...prev, status: 'saving', error: undefined }));
      try {
        const payload = {
          tenantId: tenant.tenantId,
          name: venue.name || `${tenant.name} HQ`,
          city: venue.city || tenant.city,
          tz: venue.tz,
        };
        const result = await postJson<OnboardingVenueResponse>(
          '/api/provider-onboarding/venue',
          payload,
        );
        setVenue((prev) => ({
          ...prev,
          venueId: result.venueId,
          created: result.created,
          status: 'success',
          completed: true,
        }));
        setShifts((prev) => ({
          ...prev,
          venueId: result.venueId,
        }));
        setTables((prev) => ({
          ...prev,
          venueId: result.venueId,
        }));
        goToStep('shifts');
      } catch (error) {
        setVenue((prev) => ({
          ...prev,
          status: 'error',
          error: (error as Error).message,
        }));
      }
    },
    [
      tenant.tenantId,
      tenant.name,
      tenant.city,
      venue.name,
      venue.city,
      venue.tz,
      postJson,
      goToStep,
    ],
  );

  const handleShiftSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!venue.venueId) {
        setShifts((prev) => ({
          ...prev,
          status: 'error',
          error: 'Provision a venue first.',
        }));
        return;
      }
      setShifts((prev) => ({ ...prev, status: 'saving', error: undefined }));
      try {
        const result = await postJson<OnboardingShiftsResponse>(
          '/api/provider-onboarding/shifts',
          { venueId: venue.venueId, template: shifts.template },
        );
        setShifts((prev) => ({
          ...prev,
          created: result.created,
          updated: result.updated,
          status: 'success',
          completed: true,
        }));
        goToStep('tables');
      } catch (error) {
        setShifts((prev) => ({
          ...prev,
          status: 'error',
          error: (error as Error).message,
        }));
      }
    },
    [venue.venueId, shifts.template, postJson, goToStep],
  );

  const handleTableSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!venue.venueId) {
        setTables((prev) => ({
          ...prev,
          status: 'error',
          error: 'Provision a venue first.',
        }));
        return;
      }
      setTables((prev) => ({ ...prev, status: 'saving', error: undefined }));
      try {
        const payload = {
          venueId: venue.venueId,
          grid: { rows: tables.rows, cols: tables.cols },
          min: tables.min,
          max: tables.max,
        };
        const result = await postJson<OnboardingTablesResponse>(
          '/api/provider-onboarding/tables',
          payload,
        );
        setTables((prev) => ({
          ...prev,
          created: result.created,
          updated: result.updated,
          status: 'success',
          completed: true,
        }));
        goToStep('apikey');
      } catch (error) {
        setTables((prev) => ({
          ...prev,
          status: 'error',
          error: (error as Error).message,
        }));
      }
    },
    [venue.venueId, tables.rows, tables.cols, tables.min, tables.max, postJson, goToStep],
  );

  const handleApiKeySubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!tenant.tenantId) {
        setApiKey((prev) => ({
          ...prev,
          status: 'error',
          error: 'Tenant ID missing',
        }));
        return;
      }
      setApiKey((prev) => ({ ...prev, status: 'saving', error: undefined }));
      try {
        const result = await postJson<OnboardingApiKeyResponse>(
          '/api/provider-onboarding/apikey',
          {
            tenantId: tenant.tenantId,
            plan: {
              rps: apiKey.rps,
              burst: apiKey.burst,
              monthlyCap: apiKey.monthlyCap,
            },
          },
        );
        setApiKey({
          tenantId: result.tenantId,
          apiKeyId: result.apiKeyId,
          maskedKey: result.maskedKey,
          plaintextKey: result.plaintextKey,
          rps: result.rateLimitPerMin,
          burst: result.burstLimit,
          monthlyCap: result.monthlyCap,
          reused: result.reused,
          status: 'success',
          completed: true,
          error: undefined,
        });
      } catch (error) {
        setApiKey((prev) => ({
          ...prev,
          status: 'error',
          error: (error as Error).message,
        }));
      }
    },
    [tenant.tenantId, apiKey.rps, apiKey.burst, apiKey.monthlyCap, postJson],
  );

  const renderStatus = (status: StepStatus, message?: string) => {
    if (status === 'saving') {
      return <p className="text-sm text-slate-500">Saving…</p>;
    }
    if (status === 'error') {
      return (
        <p className="text-sm text-rose-600">
          {message ?? 'Something went wrong. Try again.'}
        </p>
      );
    }
    if (status === 'success') {
      return <p className="text-sm text-emerald-600">Saved.</p>;
    }
    return null;
  };

  const snippetKey = apiKey.plaintextKey ?? apiKey.maskedKey ?? 'rk_xxxxxx';
  const completionReady = apiKey.completed && apiKey.apiKeyId;

  const curlSnippets = useMemo(() => {
    if (!completionReady) return [];
    return [
      `curl -H "x-api-key: ${snippetKey}" ${SNIPPET_BASE}/v1/provider/usage/keys`,
      `curl -H "x-api-key: ${snippetKey}" ${SNIPPET_BASE}/v1/venues/${venue.venueId}/policies`,
    ];
  }, [completionReady, snippetKey, venue.venueId]);

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="rounded-2xl border border-slate-200 bg-white p-6 lg:w-64">
        <ol className="space-y-4 text-sm text-slate-600">
          {STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isComplete = (() => {
              if (step.id === 'tenant') return tenant.completed;
              if (step.id === 'venue') return venue.completed;
              if (step.id === 'shifts') return shifts.completed;
              if (step.id === 'tables') return tables.completed;
              return apiKey.completed;
            })();
            const enabled = canVisitStep(step.id);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => goToStep(step.id)}
                  disabled={!enabled}
                  className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  } ${!enabled ? 'opacity-60' : ''}`}
                >
                  <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
                    {isComplete ? '✓' : step.id === currentStep ? '→' : '•'}
                    {step.title}
                  </span>
                  <span className="text-xs text-slate-400">
                    {step.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
      <section className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {currentStep === 'tenant' && (
          <form onSubmit={handleTenantSubmit} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Step 1 · Tenant
              </h2>
              <p className="text-sm text-slate-600">
                Create the umbrella account for this provider. These values can
                be updated later.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-900">Tenant name</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Starlight Dining Group"
                value={tenant.name}
                onChange={(e) =>
                  setTenant((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-900">City</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="New York"
                value={tenant.city}
                onChange={(e) =>
                  setTenant((prev) => ({ ...prev, city: e.target.value }))
                }
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-900">Timezone</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={tenant.tz}
                onChange={(e) =>
                  setTenant((prev) => ({ ...prev, tz: e.target.value }))
                }
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between">
              {renderStatus(tenant.status, tenant.error)}
              <button
                type="submit"
                disabled={tenant.status === 'saving'}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save &amp; Continue
              </button>
            </div>
          </form>
        )}

        {currentStep === 'venue' && (
          <form onSubmit={handleVenueSubmit} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Step 2 · Venue
              </h2>
              <p className="text-sm text-slate-600">
                Create the primary venue for this tenant. You can change these
                details later from Venues.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-900">Venue name</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Starlight Midtown"
                value={venue.name}
                onChange={(e) =>
                  setVenue((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-900">City</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="New York"
                value={venue.city}
                onChange={(e) =>
                  setVenue((prev) => ({ ...prev, city: e.target.value }))
                }
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-900">Timezone</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={venue.tz}
                onChange={(e) =>
                  setVenue((prev) => ({ ...prev, tz: e.target.value }))
                }
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between">
              {renderStatus(venue.status, venue.error)}
              <button
                type="submit"
                disabled={venue.status === 'saving'}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save &amp; Continue
              </button>
            </div>
          </form>
        )}

        {currentStep === 'shifts' && (
          <form onSubmit={handleShiftSubmit} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Step 3 · Shifts
              </h2>
              <p className="text-sm text-slate-600">
                Pick a preset schedule and we’ll seed shifts you can customize
                later.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {(['restaurant', 'bar', 'cafe'] as const).map((template) => (
                <label
                  key={template}
                  className={`flex cursor-pointer flex-col rounded-xl border px-4 py-3 text-sm ${
                    shifts.template === template
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    className="sr-only"
                    checked={shifts.template === template}
                    onChange={() =>
                      setShifts((prev) => ({ ...prev, template }))
                    }
                  />
                  <span className="font-semibold capitalize">{template}</span>
                  <span className="text-xs text-slate-400">
                    {template === 'restaurant'
                      ? 'Lunch + dinner coverage'
                      : template === 'bar'
                      ? 'Evening-heavy windows'
                      : 'Early service focus'}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              {renderStatus(shifts.status, shifts.error)}
              <button
                type="submit"
                disabled={shifts.status === 'saving'}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Seed &amp; Continue
              </button>
            </div>
          </form>
        )}

        {currentStep === 'tables' && (
          <form onSubmit={handleTableSubmit} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Step 4 · Tables
              </h2>
              <p className="text-sm text-slate-600">
                Generate a simple grid to unblock availability &amp; seating.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-900">Rows</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={tables.rows}
                  onChange={(e) =>
                    setTables((prev) => ({
                      ...prev,
                      rows: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-900">Columns</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={tables.cols}
                  onChange={(e) =>
                    setTables((prev) => ({
                      ...prev,
                      cols: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-900">
                  Min seats per table
                </span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={tables.min}
                  onChange={(e) =>
                    setTables((prev) => ({
                      ...prev,
                      min: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-900">
                  Max seats per table
                </span>
                <input
                  type="number"
                  min={tables.min}
                  max={12}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={tables.max}
                  onChange={(e) =>
                    setTables((prev) => ({
                      ...prev,
                      max: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              {renderStatus(tables.status, tables.error)}
              <button
                type="submit"
                disabled={tables.status === 'saving'}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Generate &amp; Continue
              </button>
            </div>
          </form>
        )}

        {currentStep === 'apikey' && (
          <form onSubmit={handleApiKeySubmit} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Step 5 · API access
              </h2>
              <p className="text-sm text-slate-600">
                Provision a provider-scoped key and share the token with the
                partner.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-900">Requests / sec</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={apiKey.rps}
                  onChange={(e) =>
                    setApiKey((prev) => ({
                      ...prev,
                      rps: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-900">Burst limit</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={apiKey.burst}
                  onChange={(e) =>
                    setApiKey((prev) => ({
                      ...prev,
                      burst: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-900">Monthly cap</span>
                <input
                  type="number"
                  min={50_000}
                  max={50_000_000}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={apiKey.monthlyCap}
                  onChange={(e) =>
                    setApiKey((prev) => ({
                      ...prev,
                      monthlyCap: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              {renderStatus(apiKey.status, apiKey.error)}
              <button
                type="submit"
                disabled={apiKey.status === 'saving'}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Provision key
              </button>
            </div>
            {completionReady && (
              <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div>
                  <p className="font-semibold text-emerald-900">
                    Key ready for use
                  </p>
                  <p className="text-emerald-800">
                    {apiKey.reused
                      ? 'Existing key reused. Plaintext is hidden for security.'
                      : 'Share the token below with the partner.'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 p-3 font-mono text-xs text-slate-900">
                  <div>Key ID: {apiKey.apiKeyId}</div>
                  <div>
                    Token:{' '}
                    {apiKey.plaintextKey ? (
                      <code>{apiKey.plaintextKey}</code>
                    ) : (
                      <span>{apiKey.maskedKey}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-700">
                    Sample curl
                  </p>
                  <div className="mt-1 space-y-2 font-mono text-xs text-slate-800">
                    {curlSnippets.map((snippet) => (
                      <pre
                        key={snippet}
                        className="overflow-x-auto rounded-lg border border-slate-200 bg-white/80 p-3"
                      >
                        <code>{snippet}</code>
                      </pre>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Link
                    href="/"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Start using dashboard
                  </Link>
                  <p className="text-xs text-emerald-700">
                    Tenant {tenant.tenantId} · Venue {venue.venueId}
                  </p>
                </div>
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

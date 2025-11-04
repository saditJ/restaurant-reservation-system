"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, ApiKeySummary } from '@reserve/sdk';
import { createBrowserSdk } from '@/lib/sdk';

const sdk = createBrowserSdk();

type Props = {
  initialKeys: ApiKeySummary[];
};

type Draft = {
  name: string;
  rateLimitPerMin: number;
  burstLimit: number;
};

type BusyState = Record<string, boolean>;

export default function ApiKeysClient({ initialKeys }: Props) {
  const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => buildDrafts(initialKeys));
  const [createName, setCreateName] = useState('');
  const [createRate, setCreateRate] = useState('120');
  const [createBurst, setCreateBurst] = useState('120');
  const [createScopes, setCreateScopes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [busy, setBusy] = useState<BusyState>({});
  const [flashSecret, setFlashSecret] = useState<{ value: string; label: string } | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(buildDrafts(keys));
  }, [keys]);

  const handleCreate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!createName.trim()) {
        setCreateError('Name is required');
        return;
      }
      setIsCreating(true);
      setCreateError(null);
      try {
        const rateLimitPerMin = parseNumber(createRate);
        const burstLimit = parseNumber(createBurst);
        const scopes = parseScopes(createScopes);
        const response = await sdk.apiKeys.create({
          name: createName.trim(),
          rateLimitPerMin,
          burstLimit,
          scopes: scopes.length ? scopes : undefined,
        });
        setKeys((current) => [response.key, ...current]);
        setFlashSecret({ value: response.plaintextKey, label: `New key "${response.key.name}"` });
        setCreateName('');
        setCreateRate('120');
        setCreateBurst('120');
        setCreateScopes('');
      } catch (err) {
        setCreateError(parseError(err, 'Failed to create API key'));
      } finally {
        setIsCreating(false);
      }
    },
    [createName, createRate, createBurst, createScopes],
  );

  const handleRotate = useCallback(async (key: ApiKeySummary) => {
    setError(null);
    setBusy((state) => ({ ...state, [key.id]: true }));
    try {
      const response = await sdk.apiKeys.rotate(key.id);
      setKeys((current) => current.map((item) => (item.id === key.id ? response.key : item)));
      setFlashSecret({ value: response.plaintextKey, label: `Rotated key "${response.key.name}"` });
    } catch (err) {
      setError(parseError(err, 'Failed to rotate key'));
    } finally {
      setBusy((state) => ({ ...state, [key.id]: false }));
    }
  }, []);

  const handleDisable = useCallback(async (key: ApiKeySummary) => {
    setError(null);
    setBusy((state) => ({ ...state, [key.id]: true }));
    try {
      const response = await sdk.apiKeys.disable(key.id);
      setKeys((current) => current.map((item) => (item.id === key.id ? response.key : item)));
    } catch (err) {
      setError(parseError(err, 'Failed to disable key'));
    } finally {
      setBusy((state) => ({ ...state, [key.id]: false }));
    }
  }, []);

  const handleEnable = useCallback(async (key: ApiKeySummary) => {
    setError(null);
    setBusy((state) => ({ ...state, [key.id]: true }));
    try {
      const response = await sdk.apiKeys.update(key.id, { isActive: true });
      setKeys((current) => current.map((item) => (item.id === key.id ? response.key : item)));
    } catch (err) {
      setError(parseError(err, 'Failed to enable key'));
    } finally {
      setBusy((state) => ({ ...state, [key.id]: false }));
    }
  }, []);

  const handleSave = useCallback(
    async (key: ApiKeySummary) => {
      setError(null);
      const draft = drafts[key.id];
      if (!draft) return;
      const updates: {
        name?: string;
        rateLimitPerMin?: number;
        burstLimit?: number;
      } = {};
      if (draft.name.trim() && draft.name.trim() !== key.name) {
        updates.name = draft.name.trim();
      }
      if (draft.rateLimitPerMin !== key.rateLimitPerMin) {
        updates.rateLimitPerMin = draft.rateLimitPerMin;
      }
      if (draft.burstLimit !== key.burstLimit) {
        updates.burstLimit = draft.burstLimit;
      }
      if (Object.keys(updates).length === 0) {
        return;
      }
      setBusy((state) => ({ ...state, [key.id]: true }));
      try {
        const response = await sdk.apiKeys.update(key.id, updates);
        setKeys((current) => current.map((item) => (item.id === key.id ? response.key : item)));
      } catch (err) {
        setError(parseError(err, 'Failed to update key settings'));
      } finally {
        setBusy((state) => ({ ...state, [key.id]: false }));
      }
    },
    [drafts],
  );

  const handleDraftChange = useCallback(
    (keyId: string, field: keyof Draft, value: string) => {
      setDrafts((current) => {
        const next = { ...current };
        const existing = next[keyId] ?? { name: '', rateLimitPerMin: 0, burstLimit: 0 };
        if (field === 'name') {
          next[keyId] = { ...existing, name: value };
        } else if (field === 'rateLimitPerMin') {
          next[keyId] = { ...existing, rateLimitPerMin: clampNumber(value, existing.rateLimitPerMin) };
        } else {
          next[keyId] = { ...existing, burstLimit: clampNumber(value, existing.burstLimit) };
        }
        return next;
      });
    },
    [],
  );

  const handleCopySecret = useCallback(async () => {
    if (!flashSecret) return;
    try {
      await navigator.clipboard.writeText(flashSecret.value);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.warn('Failed to copy API key', err);
    }
  }, [flashSecret]);

  const sortedKeys = useMemo(() =>
    [...keys].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [keys]);

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-gray-500">API Keys</p>
        <h2 className="text-3xl font-semibold text-gray-900">Platform access</h2>
        <p className="text-sm text-gray-600">
          Create scoped credentials for consoles, widgets, or integrations. Each key has isolated rate limits
          and can be rotated without downtime.
        </p>
      </header>

      {flashSecret && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-indigo-900">{flashSecret.label}</p>
              <p className="mt-1 text-sm text-indigo-800">
                Copy and store this value securely. It will not be shown again.
              </p>
              <code className="mt-2 block overflow-x-auto rounded bg-white px-2 py-1 text-sm text-indigo-900 shadow">
                {flashSecret.value}
              </code>
            </div>
            <button
              type="button"
              onClick={handleCopySecret}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
            >
              {copyState === 'copied' ? 'Copied' : 'Copy key'}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Create new key</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-gray-700">
            Name
            <input
              type="text"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
              placeholder="Internal usage label"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Requests / minute
            <input
              type="number"
              min={1}
              value={createRate}
              onChange={(event) => setCreateRate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Burst limit
            <input
              type="number"
              min={1}
              value={createBurst}
              onChange={(event) => setCreateBurst(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-gray-700">
          Scopes (comma separated)
          <input
            type="text"
            value={createScopes}
            onChange={(event) => setCreateScopes(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
            placeholder="default,admin"
          />
        </label>
        {createError && <p className="mt-2 text-sm text-rose-600">{createError}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={isCreating}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? 'Creating...' : 'Create key'}
          </button>
          <span className="text-xs text-gray-500">
            Defaults: 120 RPM / 120 burst.
          </span>
        </div>
      </form>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {sortedKeys.map((key) => {
          const draft = drafts[key.id] ?? {
            name: key.name,
            rateLimitPerMin: key.rateLimitPerMin,
            burstLimit: key.burstLimit,
          };
          const isBusy = busy[key.id] ?? false;
          return (
            <div key={key.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Name
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(event) => handleDraftChange(key.id, 'name', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </label>
                  <p className="mt-2 text-xs text-gray-500">Key ID: {key.id}</p>
                  <p className="mt-1 text-xs text-gray-500">Created {formatRelative(key.createdAt)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Last used {key.lastUsedAt ? formatRelative(key.lastUsedAt) : 'never'}
                  </p>
                </div>
                <div className="flex flex-row gap-3 sm:flex-col sm:items-end">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      key.isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {key.isActive ? 'Active' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRotate(key)}
                    disabled={isBusy}
                    className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? 'Working...' : 'Rotate'}
                  </button>
                  {key.isActive ? (
                    <button
                      type="button"
                      onClick={() => void handleDisable(key)}
                      disabled={isBusy}
                      className="inline-flex items-center rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? 'Working...' : 'Disable'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleEnable(key)}
                      disabled={isBusy}
                      className="inline-flex items-center rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? 'Working...' : 'Enable'}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  Requests / minute
                  <input
                    type="number"
                    min={1}
                    value={draft.rateLimitPerMin}
                    onChange={(event) => handleDraftChange(key.id, 'rateLimitPerMin', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Burst limit
                  <input
                    type="number"
                    min={1}
                    value={draft.burstLimit}
                    onChange={(event) => handleDraftChange(key.id, 'burstLimit', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  />
                </label>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>
                  <dt className="font-medium text-gray-700">Scopes</dt>
                  <dd>{key.scopes.length ? key.scopes.join(', ') : 'default'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-700">24h usage</dt>
                  <dd>{key.usage.allows24h} allow / {key.usage.drops24h} drops</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSave(key)}
                  disabled={isBusy}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBusy ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          );
        })}
        {sortedKeys.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
            <p className="font-medium text-gray-700">No keys yet</p>
            <p className="mt-1">Create your first API key to enable integrations.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function buildDrafts(keys: ApiKeySummary[]): Record<string, Draft> {
  return keys.reduce<Record<string, Draft>>((acc, key) => {
    acc[key.id] = {
      name: key.name,
      rateLimitPerMin: key.rateLimitPerMin,
      burstLimit: key.burstLimit,
    };
    return acc;
  }, {});
}

function parseNumber(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function parseScopes(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function clampNumber(raw: string, fallback: number): number {
  const next = Number(raw);
  if (!Number.isFinite(next) || next <= 0) {
    return fallback;
  }
  return Math.floor(next);
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





'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiJSON, formatApiError } from '@/lib/api';
import type { VenuePolicies, VenueSettings, VenueHours } from '@/lib/types';

const VENUE_ID = 'venue-main';

type Toast = { tone: 'success' | 'error'; message: string };

function formatHours(hours: VenueHours | null) {
  if (!hours) return '';
  const ordered = Object.keys(hours)
    .sort()
    .reduce<Record<string, VenueHours[string]>>((acc, key) => {
      acc[key] = hours[key];
      return acc;
    }, {});
  return JSON.stringify(ordered, null, 2);
}

function parseHoursInput(raw: string): VenueHours | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Hours must be valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Hours must be an object with day keys.');
  }

  const result: VenueHours = {};
  for (const [day, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      throw new Error(`hours.${day} must be an array.`);
    }
    result[day] = value.map((slot, index) => {
      if (typeof slot !== 'object' || slot === null) {
        throw new Error(`hours.${day}[${index}] must be an object.`);
      }
      const { start, end } = slot as { start?: unknown; end?: unknown };
      if (typeof start !== 'string' || typeof end !== 'string') {
        throw new Error(`hours.${day}[${index}] requires start and end strings.`);
      }
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
        throw new Error(`hours.${day}[${index}] times must be in HH:MM format.`);
      }
      if (start === end) {
        throw new Error(`hours.${day}[${index}] start and end must differ.`);
      }
      return { start, end };
    });
  }
  return result;
}

function parseMinutes(value: string, label: string, min: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a number.`);
  }
  const rounded = Math.round(number);
  if (rounded < min) {
    throw new Error(`${label} must be at least ${min}.`);
  }
  return rounded;
}

function parseDays(value: string, label: string, min: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a number.`);
  }
  const rounded = Math.round(number);
  if (rounded < min) {
    throw new Error(`${label} must be at least ${min}.`);
  }
  return rounded;
}

export default function VenueSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<VenueSettings | null>(null);
  const [policies, setPolicies] = useState<VenuePolicies | null>(null);

  const [settingsForm, setSettingsForm] = useState({
    timezone: '',
    holdTtlMin: '',
    turnTimeMin: '',
    defaultDurationMin: '',
    hoursText: '',
  });
  const [policiesForm, setPoliciesForm] = useState({
    cancellationWindowMin: '',
    guestCanModifyUntilMin: '',
    retainPersonalDataDays: '',
    noShowFeePolicy: false,
  });

  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [settingsToast, setSettingsToast] = useState<Toast | null>(null);
  const [policiesToast, setPoliciesToast] = useState<Toast | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [settingsResponse, policiesResponse] = await Promise.all([
          apiGet<VenueSettings>(`/venues/${VENUE_ID}/settings`),
          apiGet<VenuePolicies>(`/venues/${VENUE_ID}/policies`),
        ]);
        if (!active) return;
        setSettings(settingsResponse);
        setPolicies(policiesResponse);
        setSettingsForm({
          timezone: settingsResponse.timezone,
          holdTtlMin: String(settingsResponse.holdTtlMin),
          turnTimeMin: String(settingsResponse.turnTimeMin),
          defaultDurationMin: String(settingsResponse.defaultDurationMin),
          hoursText: formatHours(settingsResponse.hours),
        });
        setPoliciesForm({
          cancellationWindowMin: String(policiesResponse.cancellationWindowMin),
          guestCanModifyUntilMin: String(policiesResponse.guestCanModifyUntilMin),
          retainPersonalDataDays: String(policiesResponse.retainPersonalDataDays),
          noShowFeePolicy: policiesResponse.noShowFeePolicy,
        });
      } catch (error) {
        if (!active) return;
        const meta = formatApiError(error);
        setLoadError(meta.message || 'Failed to load venue settings.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsToast) return;
    const id = setTimeout(() => setSettingsToast(null), 4000);
    return () => clearTimeout(id);
  }, [settingsToast]);

  useEffect(() => {
    if (!policiesToast) return;
    const id = setTimeout(() => setPoliciesToast(null), 4000);
    return () => clearTimeout(id);
  }, [policiesToast]);

  const cancellationSummary = useMemo(() => {
    const minutes = Number(policiesForm.cancellationWindowMin || '0');
    if (!Number.isFinite(minutes) || minutes <= 0) return 'No advance notice required.';
    const hours = minutes / 60;
    if (hours < 1) return `${minutes} minutes before arrival`;
    return `${Math.round(hours * 10) / 10} hours before arrival`;
  }, [policiesForm.cancellationWindowMin]);

const modifySummary = useMemo(() => {
  const minutes = Number(policiesForm.guestCanModifyUntilMin || '0');
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Guests can edit any time.';
  const hours = minutes / 60;
  if (hours < 1) return `${minutes} minutes before arrival`;
  return `${Math.round(hours * 10) / 10} hours before arrival`;
}, [policiesForm.guestCanModifyUntilMin]);

const retentionSummary = useMemo(() => {
  const days = Number(policiesForm.retainPersonalDataDays || '0');
  if (!Number.isFinite(days) || days <= 0) return 'No automatic anonymization.';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = days / 30;
  return `${Math.round(months * 10) / 10} months (~${days} days)`;
}, [policiesForm.retainPersonalDataDays]);

  async function handleSettingsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true);
    setSettingsToast(null);
    try {
      const hoursPayload = parseHoursInput(settingsForm.hoursText);
      const payload = {
        timezone: settingsForm.timezone.trim(),
        holdTtlMin: parseMinutes(settingsForm.holdTtlMin, 'Hold TTL (minutes)', 1),
        turnTimeMin: parseMinutes(settingsForm.turnTimeMin, 'Turn time (minutes)', 0),
        defaultDurationMin: parseMinutes(
          settingsForm.defaultDurationMin,
          'Default duration (minutes)',
          15,
        ),
        hours: hoursPayload,
      };
      const updated = await apiJSON<VenueSettings>(
        `/venues/${VENUE_ID}/settings`,
        'PUT',
        payload,
      );
      setSettings(updated);
      setSettingsForm((current) => ({
        ...current,
        timezone: updated.timezone,
        holdTtlMin: String(updated.holdTtlMin),
        turnTimeMin: String(updated.turnTimeMin),
        defaultDurationMin: String(updated.defaultDurationMin),
        hoursText: formatHours(updated.hours),
      }));
      setSettingsToast({ tone: 'success', message: 'Venue settings saved.' });
    } catch (error) {
      const meta = formatApiError(error);
      setSettingsToast({
        tone: 'error',
        message: meta.message || 'Unable to save venue settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handlePoliciesSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPolicies(true);
    setPoliciesToast(null);
    try {
      const cancellationWindow = parseMinutes(
        policiesForm.cancellationWindowMin,
        'Cancellation window (minutes)',
        0,
      );
      const guestModify = parseMinutes(
        policiesForm.guestCanModifyUntilMin,
        'Guest modification window (minutes)',
        0,
      );
      const retentionDays = parseDays(
        policiesForm.retainPersonalDataDays,
        'Retention period (days)',
        30,
      );
      const payload = {
        cancellationWindowMin: cancellationWindow,
        guestCanModifyUntilMin: guestModify,
        retainPersonalDataDays: retentionDays,
        noShowFeePolicy: policiesForm.noShowFeePolicy,
      };
      const updated = await apiJSON<VenuePolicies>(
        `/venues/${VENUE_ID}/policies`,
        'PUT',
        payload,
      );
      setPolicies(updated);
      setPoliciesForm({
        cancellationWindowMin: String(updated.cancellationWindowMin),
        guestCanModifyUntilMin: String(updated.guestCanModifyUntilMin),
        retainPersonalDataDays: String(updated.retainPersonalDataDays),
        noShowFeePolicy: updated.noShowFeePolicy,
      });
      setPoliciesToast({ tone: 'success', message: 'Policies updated.' });
    } catch (error) {
      const meta = formatApiError(error);
      setPoliciesToast({
        tone: 'error',
        message: meta.message || 'Unable to update policies.',
      });
    } finally {
      setSavingPolicies(false);
    }
  }

  const timezoneLabel = settings?.timezone ?? '—';
  const feeStatus = policies?.noShowFeePolicy ? 'Enabled' : 'Disabled';

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="text-xl font-semibold text-gray-900">Venue Settings</div>
        <nav className="text-sm text-gray-600">
          <a href="/settings" className="hover:text-gray-900">
            ← Back to Settings
          </a>
        </nav>
      </header>

      {loading ? (
        <div className="mt-10 max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-sm text-gray-600">
          Loading venue configuration…
        </div>
      ) : loadError ? (
        <div className="mt-10 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          {loadError}
        </div>
      ) : (
        <>
          <div className="mt-6 max-w-5xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-600">
            <div>
              Current timezone:{' '}
              <span className="font-mono text-gray-900">{timezoneLabel}</span>
            </div>
            <div className="mt-1">
              No-show fee policy:{' '}
              <span className="font-medium text-gray-900">{feeStatus}</span>
            </div>
            <div className="mt-1">
              Data retention:{' '}
              <span className="font-medium text-gray-900">
                {policies?.retainPersonalDataDays ?? '—'} days
              </span>
            </div>
          </div>

          <section className="mt-6 grid max-w-5xl gap-8 lg:grid-cols-2">
            <form
              onSubmit={handleSettingsSubmit}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
            >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Booking defaults</h2>
              <p className="text-sm text-gray-600">
                Control working hours and timing defaults used by holds and new reservations.
              </p>
            </div>

            {settingsToast && (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  settingsToast.tone === 'success'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {settingsToast.message}
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700">
              Timezone
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={settingsForm.timezone}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                placeholder="e.g. Europe/Tirane"
              />
              <span className="mt-1 block text-xs text-gray-500">
                IANA timezone identifier (e.g. Europe/Tirane, America/New_York).
              </span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Hold TTL (minutes)
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={settingsForm.holdTtlMin}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      holdTtlMin: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Turn time buffer (minutes)
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={settingsForm.turnTimeMin}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      turnTimeMin: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="text-sm font-medium text-gray-700">
              Default reservation duration (minutes)
              <input
                type="number"
                min={15}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={settingsForm.defaultDurationMin}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    defaultDurationMin: event.target.value,
                  }))
                }
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Opening hours JSON
              <textarea
                rows={10}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                value={settingsForm.hoursText}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    hoursText: event.target.value,
                  }))
                }
                placeholder='{"monday":[{"start":"10:00","end":"22:00"}]}'
              />
              <span className="mt-1 block text-xs text-gray-500">
                Leave blank to clear. Keys should be day names mapping to arrays of start/end pairs.
              </span>
            </label>

            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={savingSettings}
            >
              {savingSettings ? 'Saving…' : 'Save settings'}
            </button>
          </form>

          <form
            onSubmit={handlePoliciesSubmit}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Guest policies</h2>
              <p className="text-sm text-gray-600">
                Define how the booking widget enforces cancellations and guest edits.
              </p>
            </div>

            {policiesToast && (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  policiesToast.tone === 'success'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {policiesToast.message}
              </div>
            )}

            <label className="text-sm font-medium text-gray-700">
              Cancellation window (minutes)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={policiesForm.cancellationWindowMin}
                onChange={(event) =>
                  setPoliciesForm((current) => ({
                    ...current,
                    cancellationWindowMin: event.target.value,
                  }))
                }
              />
              <span className="mt-1 block text-xs text-gray-500">
                Guests must cancel at least {cancellationSummary}.
              </span>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Guest modification window (minutes)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={policiesForm.guestCanModifyUntilMin}
                onChange={(event) =>
                  setPoliciesForm((current) => ({
                    ...current,
                    guestCanModifyUntilMin: event.target.value,
                  }))
                }
              />
              <span className="mt-1 block text-xs text-gray-500">
                Guests can edit contact details until {modifySummary}.
              </span>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Data retention (days)
              <input
                type="number"
                min={30}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={policiesForm.retainPersonalDataDays}
                onChange={(event) =>
                  setPoliciesForm((current) => ({
                    ...current,
                    retainPersonalDataDays: event.target.value,
                  }))
                }
              />
              <span className="mt-1 block text-xs text-gray-500">
                Guest contact data is anonymized after {retentionSummary}.
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={policiesForm.noShowFeePolicy}
                onChange={(event) =>
                  setPoliciesForm((current) => ({
                    ...current,
                    noShowFeePolicy: event.target.checked,
                  }))
                }
              />
              Apply no-show fee after cancellation window
            </label>

            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={savingPolicies}
            >
              {savingPolicies ? 'Saving…' : 'Save policies'}
            </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}

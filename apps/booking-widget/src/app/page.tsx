'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ApiError,
  VENUE_ID,
  checkHealth,
  createHold,
  createReservation,
  fetchAvailability,
} from '@/lib/api';
import {
  useLocale,
  localeOptions,
  type Locale,
  type TranslationKey,
} from '@/lib/i18n';
import type {
  AvailabilityResponse,
  AvailabilityTable,
  Hold,
  Reservation,
  ReservationStatus,
} from '@/lib/types';
import { TimePicker } from '@/components/TimePicker';

const steps = [
  { id: 'plan', labelKey: 'wizard.step.plan' },
  { id: 'details', labelKey: 'wizard.step.details' },
  { id: 'edit', labelKey: 'wizard.step.edit' },
  { id: 'review', labelKey: 'wizard.step.review' },
] as const;

type StepId = (typeof steps)[number]['id'] | 'complete';

function isWizardStep(step: StepId): step is (typeof steps)[number]['id'] {
  return step === 'plan' || step === 'details' || step === 'edit' || step === 'review';
}

function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundToQuarterHour(base = new Date()): string {
  const date = new Date(base);
  date.setMilliseconds(0);
  date.setSeconds(0);
  const minutes = date.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;
  if (roundedMinutes === 60) {
    date.setMinutes(0);
    date.setHours(date.getHours() + 1);
  } else {
    date.setMinutes(roundedMinutes);
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

function normalizeTimeInput(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) {
    return trimmed;
  }
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2] ?? '0')));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function pickAutoTable(
  tables: AvailabilityTable[],
  partySize: number,
): AvailabilityTable | null {
  if (!tables || tables.length === 0) {
    return null;
  }
  const sorted = [...tables].sort((a, b) => {
    if (a.capacity !== b.capacity) {
      return a.capacity - b.capacity;
    }
    const labelA = (a.label ?? a.id).toString();
    const labelB = (b.label ?? b.id).toString();
    return labelA.localeCompare(labelB);
  });
  return sorted.find((table) => table.capacity >= partySize) ?? sorted[0];
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatDate(date: string, locale: Locale) {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(utc);
}

function formatTime(date: string, time: string, locale: Locale) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(utc);
}

function formatTimestamp(value: string, locale: Locale) {
  const instant = new Date(value);
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

function formatStatus(
  status: ReservationStatus,
  translate: (key: TranslationKey) => string,
) {
  const key = `status.${status}` as TranslationKey;
  return translate(key);
}

function toStepId(value: string | null): StepId {
  if (value === 'complete') return 'complete';
  if (value === 'plan' || value === 'details' || value === 'edit' || value === 'review') {
    return value;
  }
  return 'plan';
}

function isValidIsoDate(value: string | null): value is string {
  if (!value) return false;
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const segment = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${segment()}${segment()}-${segment()}-${segment()}-${segment()}-${segment()}${segment()}${segment()}`;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withBackoff<T>(fn: () => Promise<T>, attempts = 3, initialDelay = 400): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (
        !(error instanceof ApiError && error.status === 429) ||
        attempt >= attempts
      ) {
        throw error;
      }
      await wait(delay);
      delay *= 2;
    }
  }
}

function trackEvent(event: string, data: Record<string, unknown> = {}) {
  console.info('[analytics]', event, data);
}

function isValidName(value: string) {
  return value.trim().length >= 2;
}

function isValidEmail(value: string) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7;
}

function HealthBadge() {
  const { t } = useLocale();
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then((res) => {
        if (!cancelled) {
          setStatus(res.status === 'ok' ? 'ok' : 'error');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    status === 'checking'
      ? t('app.health.checking')
      : status === 'ok'
        ? t('app.health.ok')
        : t('app.health.error');
  const badgeClass =
    status === 'ok'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'checking'
        ? 'bg-gray-100 text-gray-700'
        : 'bg-rose-100 text-rose-800';

  return (
    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${badgeClass}`}>
      {label}
    </span>
  );
}

function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <label className="text-xs text-gray-600 flex flex-col gap-1">
      <span className="font-semibold">{t('app.locale.toggle')}</span>
      <select
        className="border rounded-lg px-2 py-1 text-sm"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {localeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}

function StepIndicator({
  active,
}: {
  active: (typeof steps)[number]['id'];
}) {
  const { t } = useLocale();
  const currentIndex = steps.findIndex((step) => step.id === active);
  const summary = t('wizard.stepOf', {
    current: currentIndex + 1,
    total: steps.length,
  });

  return (
    <nav aria-label={summary} className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-gray-500">
        {summary}
      </p>
      <ol className="flex gap-3">
        {steps.map((step, index) => {
          const isActive = step.id === active;
          const isCompleted = index < currentIndex;
          return (
            <li key={step.id}>
              <span
                aria-current={isActive ? 'step' : undefined}
                className={`inline-flex items-center gap-2 text-sm font-medium ${
                  isActive
                    ? 'text-black'
                    : isCompleted
                      ? 'text-emerald-700'
                      : 'text-gray-500'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                    isActive
                      ? 'border-black bg-black text-white'
                      : isCompleted
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-gray-300 bg-white text-gray-600'
                  }`}
                >
                  {index + 1}
                </span>
                {t(step.labelKey)}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ConflictsPanel({
  availability,
  onRetry,
}: {
  availability: AvailabilityResponse | null;
  onRetry?: () => void;
}) {
  const { t, locale } = useLocale();
  if (!availability) return null;
  const availableCount = availability?.stats?.available ?? 0;
  // Only show conflicts when no tables are currently available for the request.
  if (availableCount > 0) return null;
  const reservations = availability.conflicts?.reservations ?? [];
  const holds = availability.conflicts?.holds ?? [];
  const total = reservations.length + holds.length;
  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="text-sm font-semibold text-amber-800">
        {t('plan.conflicts.title')}
      </div>
      {reservations.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-amber-700">
            {t('plan.conflicts.reservations')}
          </div>
          <ul className="mt-1 space-y-1 text-xs text-amber-700">
            {reservations.map((conflict) => (
              <li key={conflict.id}>
                {t('plan.conflicts.slot', {
                  date: formatDate(conflict.slotLocalDate, locale),
                  time: formatTime(
                    conflict.slotLocalDate,
                    conflict.slotLocalTime,
                    locale,
                  ),
                  table: conflict.tableId ?? 'auto',
                  status: formatStatus(conflict.status, t),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {holds.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-amber-700">
            {t('plan.conflicts.holds')}
          </div>
          <ul className="mt-1 space-y-1 text-xs text-amber-700">
            {holds.map((conflict) => (
              <li key={conflict.id}>
                {t('plan.conflicts.holdSlot', {
                  date: formatDate(conflict.slotLocalDate, locale),
                  time: formatTime(
                    conflict.slotLocalDate,
                    conflict.slotLocalTime,
                    locale,
                  ),
                  table: conflict.tableId ?? 'auto',
                  expires: formatTimestamp(conflict.expiresAt, locale),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          className="inline-flex items-center rounded-lg border border-amber-500 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
          onClick={() => {
            void onRetry();
          }}
        >
          {t('plan.conflicts.cta')}
        </button>
      )}
    </div>
  );
}

export default function BookingWidget() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [venueId, setVenueId] = useState<string>(VENUE_ID);

  const initialDate = isValidIsoDate(searchParams.get('date'))
    ? (searchParams.get('date') as string)
    : todayISO();
  const fallbackTime = roundToQuarterHour();
  const initialTime = normalizeTimeInput(searchParams.get('time') ?? fallbackTime);
  const initialPartyRaw = Number.parseInt(searchParams.get('party') ?? '', 10);
  const initialParty = Number.isFinite(initialPartyRaw) && initialPartyRaw > 0 ? initialPartyRaw : 2;
  const initialStep = toStepId(searchParams.get('step'));

  const [stepValue, setStepValue] = useState<StepId>(initialStep);
  const [dateValue, setDateValue] = useState(initialDate);
  const [timeValue, setTimeValue] = useState(initialTime);
  const [partyValue, setPartyValue] = useState(initialParty);

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      let changed = false;
      for (const [key, value] of Object.entries(updates)) {
        const current = params.get(key);
        if (value === null) {
          if (current !== null) {
            params.delete(key);
            changed = true;
          }
        } else if (current !== value) {
          params.set(key, value);
          changed = true;
        }
      }
      if (!changed) return;
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setStep = useCallback(
    (next: StepId) => {
      setStepValue(next);
      updateQuery({ step: next });
    },
    [updateQuery],
  );

  const setDate = useCallback(
    (value: string) => {
      setDateValue(value);
      updateQuery({ date: value });
    },
    [updateQuery],
  );

  const setTime = useCallback(
    (value: string) => {
      setTimeValue(value);
      updateQuery({ time: value });
    },
    [updateQuery],
  );

  const setParty = useCallback(
    (value: number) => {
      const normalized = Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
      setPartyValue(normalized);
      updateQuery({ party: String(normalized) });
    },
    [updateQuery],
  );

  const step = stepValue;
  const date = dateValue;
  const time = timeValue;
  const party = partyValue;

  useEffect(() => {
    const paramStep = toStepId(searchParams.get('step'));
    if (paramStep !== stepValue) {
      setStepValue(paramStep);
    }
    const paramDate = searchParams.get('date');
    if (paramDate && isValidIsoDate(paramDate) && paramDate !== dateValue) {
      setDateValue(paramDate);
    }
    const paramTime = searchParams.get('time');
    if (paramTime) {
      const normalized = normalizeTimeInput(paramTime);
      if (normalized !== timeValue) {
        setTimeValue(normalized);
      }
    }
    const paramParty = Number.parseInt(searchParams.get('party') ?? '', 10);
    if (Number.isFinite(paramParty) && paramParty > 0 && paramParty !== partyValue) {
      setPartyValue(paramParty);
    }
  }, [searchParams, stepValue, dateValue, timeValue, partyValue]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlVenueId = params.get('tenantId') || params.get('venueId') || VENUE_ID;
      setVenueId(urlVenueId);
    }
  }, []);

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null,
  );
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [lastSearchParams, setLastSearchParams] = useState<{
    date: string;
    time: string;
    party: number;
  } | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
  }>({});

  const [hold, setHold] = useState<Hold | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [creatingHold, setCreatingHold] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [reservationError, setReservationError] = useState<string | null>(null);

  const availableTables = availability?.tables ?? [];
  async function loadAvailability(params: {
    date: string;
    time: string;
    party: number;
  }) {
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    setHold(null);
    setHoldError(null);
    setReservation(null);
    setReservationError(null);

    try {
      const response = await fetchAvailability({
        venueId: venueId,
        date: params.date,
        time: params.time,
        partySize: params.party,
      });
      setAvailability(response);
      setLastSearchParams({ ...params });
      if (response.tables.length === 0) {
        setAvailabilityError(t('plan.empty'));
        return false;
      }
      trackEvent('selection_made', {
        date: params.date,
        time: params.time,
        party: params.party,
      });
      return true;
    } catch (error) {
      setAvailability(null);
      setAvailabilityError(getErrorMessage(error, t('plan.error')));
      return false;
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function handlePlanSubmit(event: FormEvent<HTMLFormElement>, nextStep: StepId = 'details') {
    event.preventDefault();
    const normalized = normalizeTimeInput(time);
    if (normalized !== time) {
      setTime(normalized);
    }
    const success = await loadAvailability({ date, time: normalized, party });
    if (success) {
      setStep(nextStep);
    }
  }

  async function retryAvailability() {
    const normalized = normalizeTimeInput(time);
    if (normalized !== time) {
      setTime(normalized);
    }
    const params = lastSearchParams ?? { date, time: normalized, party };
    await loadAvailability(params);
  }

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsentError(null);
    setHoldError(null);
    setFieldErrors({});

    const normalizedTime = normalizeTimeInput(time);
    if (normalizedTime !== time) {
      setTime(normalizedTime);
    }

    if (!consentTerms) {
      setConsentError(t('form.required'));
      return;
    }

    const trimmedName = guestName.trim();
    const sanitizedPhone = normalizePhone(guestPhone);
    const trimmedEmail = guestEmail.trim();

    const errors: typeof fieldErrors = {};
    if (!isValidName(trimmedName)) {
      errors.name = t('details.errors.name');
    }
    if (!isValidPhone(sanitizedPhone)) {
      errors.phone = t('details.errors.phone');
    }
    if (!isValidEmail(trimmedEmail)) {
      errors.email = t('details.errors.email');
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setCreatingHold(true);
    try {
      const autoTable = pickAutoTable(availableTables, party);

      if (!autoTable) {
        setHoldError(t('details.hold.error'));
        setCreatingHold(false);
        return;
      }

      const nextHold = await withBackoff(() =>
        createHold(
          {
            venueId: venueId,
            date,
            time: normalizedTime,
            partySize: party,
            tableId: autoTable.id,
            createdBy: 'guest-widget',
          },
          { idempotencyKey: generateIdempotencyKey() },
        ),
      );
      setHold(nextHold);
      trackEvent('hold_created', {
        holdId: nextHold.id,
        date: nextHold.booking.date,
        time: nextHold.booking.time,
        party: nextHold.booking.partySize,
      });
      setStep('review');
    } catch (error) {
      setHold(null);
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setHoldError(t('errors.conflict'));
          setStep('edit');
          await retryAvailability();
        } else if (error.status === 429) {
          setHoldError(t('errors.rateLimit'));
        } else {
          setHoldError(getErrorMessage(error, t('details.hold.error')));
        }
      } else {
        setHoldError(getErrorMessage(error, t('details.hold.error')));
      }
      const status = error instanceof ApiError ? error.status : undefined;
      if (status !== 409 && status !== 429) {
        await retryAvailability();
      }
    } finally {
      setCreatingHold(false);
    }
  }

  async function confirmReservation() {
    if (!hold) {
      setReservationError(t('review.error'));
      return;
    }

    setConfirming(true);
    setReservationError(null);
    try {
      const normalizedName = guestName.trim() || 'Guest';
      const normalizedPhone = normalizePhone(guestPhone);
      const normalizedEmail = guestEmail.trim();
      const normalizedNotes = guestNotes.trim();
      const consentNotes = ['Privacy consent accepted: yes'];
      if (consentMarketing) {
        consentNotes.push('Marketing opt-in: yes');
      }
      const notesPayload = [normalizedNotes, ...consentNotes].filter(Boolean).join('\n');
      const nextReservation = await withBackoff(() =>
        createReservation(
          {
            venueId: venueId,
            holdId: hold.id,
            guestName: normalizedName,
            guestPhone: normalizedPhone ? normalizedPhone : null,
            guestEmail: normalizedEmail ? normalizedEmail : null,
            notes: notesPayload || null,
            channel: 'guest-web',
            createdBy: 'guest-widget',
          },
          { idempotencyKey: generateIdempotencyKey() },
        ),
      );
      setReservation(nextReservation);
      setStep('complete');
      trackEvent('reservation_confirmed', {
        reservationId: nextReservation.id,
        code: nextReservation.code,
        party: nextReservation.partySize,
        date: nextReservation.slotLocalDate,
        time: nextReservation.slotLocalTime,
      });
    } catch (error) {
      setReservation(null);
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setReservationError(t('errors.conflict'));
          setStep('edit');
          await retryAvailability();
        } else if (error.status === 429) {
          setReservationError(t('errors.rateLimit'));
        } else {
          setReservationError(getErrorMessage(error, t('review.error')));
        }
      } else {
        setReservationError(getErrorMessage(error, t('review.error')));
      }
    } finally {
      setConfirming(false);
    }
  }

  function resetWizard() {
    setStep('plan');
    setHold(null);
    setReservation(null);
    setReservationError(null);
    setHoldError(null);
    setGuestName('');
    setGuestPhone('');
    setGuestEmail('');
    setGuestNotes('');
    setConsentTerms(false);
    setConsentMarketing(false);
    setConsentError(null);
    setFieldErrors({});
    setAvailability(null);
    setAvailabilityError(null);
    setLastSearchParams(null);
    setParty(2);
    setDate(todayISO());
    setTime(roundToQuarterHour());
  }

  const reviewDate = hold?.booking.date ?? date;
  const reviewTime = hold?.booking.time ?? time;
  const reviewGuestName = guestName.trim() || t('review.guestFallback');
  const reviewGuestPhone = guestPhone.trim() || t('review.notProvided');
  const reviewGuestEmail = guestEmail.trim() || t('review.notProvided');
  const reviewGuestNotes = guestNotes.trim();

  return (
    <main
      role="main"
      className="bg-slate-50 min-h-screen"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {t('app.title')}
            </h1>
            <p className="text-sm text-gray-600 max-w-lg">
              {t('app.description')}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <HealthBadge />
            <LocaleSwitcher />
          </div>
        </header>

        {isWizardStep(step) && <StepIndicator active={step} />}

        {step === 'plan' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <form onSubmit={handlePlanSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="plan-party"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('plan.party')}
                  </label>
                  <input
                    id="plan-party"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    inputMode="numeric"
                    min={1}
                    name="party"
                    onChange={(event) => setParty(Number(event.target.value))}
                    required
                    type="number"
                    value={party}
                  />
                </div>
                <div>
                  <label
                    htmlFor="plan-date"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('plan.date')}
                  </label>
                  <input
                    id="plan-date"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    name="date"
                    onChange={(event) => setDate(event.target.value)}
                    required
                    type="date"
                    value={date}
                  />
                </div>
                <div>
                  <label
                    htmlFor="plan-time"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('plan.time')}
                  </label>
                  <TimePicker
                    id="plan-time"
                    name="time"
                    value={time}
                    onChange={setTime}
                    required
                    placeholder="HH:MM"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  disabled={availabilityLoading}
                >
                  {availabilityLoading ? t('plan.loading') : t('plan.submit')}
                </button>
              </div>
            </form>
            <div className="space-y-4">
              {availabilityError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                >
                  {availabilityError}
                </div>
              )}
              <ConflictsPanel availability={availability} onRetry={retryAvailability} />
            </div>
          </section>
        )}

        {step === 'edit' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {t('edit.heading')}
              </h2>
              <p className="text-sm text-gray-600 max-w-lg">
                {t('edit.description')}
              </p>
            </div>
            <form
              onSubmit={(event) => handlePlanSubmit(event, 'details')}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-party"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('plan.party')}
                  </label>
                  <input
                    id="edit-party"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    inputMode="numeric"
                    min={1}
                    name="party"
                    onChange={(event) => setParty(Number(event.target.value))}
                    required
                    type="number"
                    value={party}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-date"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('plan.date')}
                  </label>
                  <input
                    id="edit-date"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    name="date"
                    onChange={(event) => setDate(event.target.value)}
                    required
                    type="date"
                    value={date}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-time"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('plan.time')}
                  </label>
                  <TimePicker
                    id="edit-time"
                    value={time}
                    onChange={(value) => setTime(value)}
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={() => setStep('review')}
                >
                  {t('wizard.back')}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  disabled={availabilityLoading}
                >
                  {availabilityLoading ? t('plan.loading') : t('edit.submit')}
                </button>
              </div>
            </form>
            <div className="space-y-4">
              {availabilityError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                >
                  {availabilityError}
                </div>
              )}
              <ConflictsPanel availability={availability} onRetry={retryAvailability} />
            </div>
          </section>
        )}

        {step === 'details' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <ConflictsPanel availability={availability} onRetry={retryAvailability} />
            <form
              onSubmit={handleDetailsSubmit}
              className="space-y-6"
            >
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {t('details.tables.autoAssign')}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="guest-name"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('details.name')}
                  </label>
                  <input
                    id="guest-name"
                    className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.name ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : ''}`}
                    name="guestName"
                    onChange={(event) => {
                      setGuestName(event.target.value);
                      setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="Jane Doe"
                    required
                    value={guestName}
                    autoComplete="name"
                    aria-invalid={fieldErrors.name ? 'true' : 'false'}
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.name}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="guest-phone"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('details.phone')}
                  </label>
                  <input
                    id="guest-phone"
                    className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.phone ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : ''}`}
                    name="guestPhone"
                    onChange={(event) => {
                      setGuestPhone(event.target.value);
                      setHoldError(null);
                      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="+1 555 123 4567"
                    required
                    value={guestPhone}
                    autoComplete="tel"
                    inputMode="tel"
                    aria-invalid={fieldErrors.phone ? 'true' : 'false'}
                  />
                  {fieldErrors.phone && (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.phone}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label
                    htmlFor="guest-email"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('details.email')}
                  </label>
                  <input
                    id="guest-email"
                    className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.email ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : ''}`}
                    type="email"
                    name="guestEmail"
                    onChange={(event) => {
                      setGuestEmail(event.target.value);
                      setHoldError(null);
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="guest@example.com"
                    value={guestEmail}
                    autoComplete="email"
                    aria-invalid={fieldErrors.email ? 'true' : 'false'}
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label
                    htmlFor="guest-notes"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('details.notes')}
                  </label>
                  <textarea
                    id="guest-notes"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    name="guestNotes"
                    onChange={(event) => {
                      setGuestNotes(event.target.value);
                      setHoldError(null);
                    }}
                    placeholder={t('details.notes.help')}
                    rows={3}
                    value={guestNotes}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t('details.notes.help')}
                  </p>
                </div>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-gray-800">
                  {t('details.consents.title')}
                </legend>
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    id="consent-terms"
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={consentTerms}
                    required
                    aria-describedby={consentError ? 'consent-error' : undefined}
                    onChange={(event) => {
                      setConsentTerms(event.target.checked);
                      if (event.target.checked) {
                        setConsentError(null);
                      }
                    }}
                  />
                  <label htmlFor="consent-terms">
                    {t('details.consent.terms')}
                  </label>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    id="consent-marketing"
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={consentMarketing}
                    onChange={(event) => setConsentMarketing(event.target.checked)}
                  />
                  <label htmlFor="consent-marketing">
                    {t('details.consent.updates')}
                  </label>
                </div>
                {consentError && (
                  <p
                    id="consent-error"
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
                  >
                    {consentError}
                  </p>
                )}
              </fieldset>

              {holdError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  {holdError}
                </div>
              )}

              <div className="flex justify-between">
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={() => setStep('plan')}
                >
                  {t('wizard.back')}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  disabled={creatingHold}
                >
                  {creatingHold ? t('plan.loading') : t('details.submit')}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 'review' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {t('review.heading')}
              </h2>
              <p className="text-sm text-gray-600">
                {t('review.slot', {
                  date: formatDate(reviewDate, locale),
                  time: formatTime(reviewDate, reviewTime, locale),
                })}
                {' - '}
                {t('review.party', { party })}
              </p>
              <p className="text-sm text-gray-600">
                {t('review.table.auto')}
              </p>
              <p className="text-sm text-gray-600">
                {t('review.contactName', { name: reviewGuestName })}
              </p>
              <p className="text-sm text-gray-600">
                {t('review.phone', { phone: reviewGuestPhone })}
              </p>
              <p className="text-sm text-gray-600">
                {t('review.email', { email: reviewGuestEmail })}
              </p>
              <p className="text-sm text-gray-600">
                {reviewGuestNotes
                  ? t('review.notes', { notes: reviewGuestNotes })
                  : t('review.notes.none')}
              </p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>{t('review.consents.required')}</li>
                {consentMarketing && <li>{t('review.consents.marketing')}</li>}
              </ul>
              <div className="pt-2">
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  onClick={() => {
                    setHold(null);
                    setHoldError(null);
                    setReservationError(null);
                    setStep('edit');
                  }}
                >
                  {t('review.editAction')}
                </button>
              </div>
            </div>

            {reservationError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {reservationError}
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setStep('details')}
              >
                {t('wizard.back')}
              </button>
              <button
                type="button"
                onClick={() => void confirmReservation()}
                className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={confirming}
              >
                {confirming ? t('review.confirming') : t('review.confirm')}
              </button>
            </div>
          </section>
        )}

        {reservation && step === 'complete' && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-emerald-800">
              {t('review.success.title')}
            </h2>
            <p className="text-sm text-emerald-700">
              {t('review.slot', {
                date: formatDate(reservation.slotLocalDate, locale),
                time: formatTime(
                  reservation.slotLocalDate,
                  reservation.slotLocalTime,
                  locale,
                ),
              })}
              {' - '}
              {t('review.party', { party: reservation.partySize })}
            </p>
            <p className="text-sm text-emerald-700">
              {t('review.success.code')}:{' '}
              <span className="font-mono">{reservation.code}</span>
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/r/${reservation.code}`}
                className="inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                {t('review.success.manage')}
              </Link>
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                onClick={resetWizard}
              >
                {t('review.success.another')}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

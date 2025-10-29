'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError, getVenuePolicies, listReservations, updateReservation, updateReservationStatus } from '@/lib/api';
import {
  useLocale,
  type Locale,
  type TranslationKey,
} from '@/lib/i18n';
import type {
  Reservation,
  ReservationListResponse,
  ReservationStatus,
  VenuePolicies,
} from '@/lib/types';

const CANCELLABLE_STATUSES: ReservationStatus[] = ['PENDING', 'CONFIRMED'];

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

function formatStatus(
  status: ReservationStatus,
  translate: (key: TranslationKey) => string,
) {
  const key = `status.${status}` as TranslationKey;
  return translate(key);
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

export default function ReservationPage({
  params,
}: {
  params: { code: string };
}) {
  const code = (params.code || '').trim().toUpperCase();
  const { t, locale } = useLocale();

  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [policies, setPolicies] = useState<VenuePolicies | null>(null);
  const [errorKey, setErrorKey] = useState<'fetch' | 'not-found' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const [cancelState, setCancelState] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelProcessing, setCancelProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrorKey(null);
      setErrorMessage(null);
      setSaveState('idle');
      setCancelState('idle');
      try {
        const search = new URLSearchParams({ limit: '1', q: code });
        const data = await listReservations(Object.fromEntries(search));
        if (!active) return;
        const match = data.items.find(
          (item) => item.code.trim().toUpperCase() === code,
        );
        if (!match) {
          setReservation(null);
          setPolicies(null);
          setEditName('');
          setEditPhone('');
          setEditEmail('');
          setErrorKey('not-found');
        } else {
          setReservation(match);
          setEditName(match.guestName);
          setEditPhone(match.guestPhone ?? '');
          setEditEmail(match.guestEmail ?? '');
          setErrorKey(null);
          setPolicies(null);
          setPolicyError(null);
          try {
            const venuePolicies = await getVenuePolicies(match.venueId);
            if (!active) return;
            setPolicies(venuePolicies);
          } catch (policyCause) {
            if (!active) return;
            setPolicies(null);
            setPolicyError(getErrorMessage(policyCause, ''));
          }
        }
      } catch (error) {
        if (!active) return;
        setReservation(null);
        setEditName('');
        setEditPhone('');
        setEditEmail('');
        setErrorKey('fetch');
        setErrorMessage(getErrorMessage(error, ''));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    if (code) {
      void load();
    } else {
      setLoading(false);
      setReservation(null);
      setErrorKey('not-found');
    }
    return () => {
      active = false;
    };
  }, [code]);

  const cancellationWindowMinutes = policies?.cancellationWindowMin ?? 120;
  const modifyWindowMinutes = policies?.guestCanModifyUntilMin ?? 0;
  const windowHours = Math.ceil(cancellationWindowMinutes / 60);
  const modifyWindowHours = Math.ceil(modifyWindowMinutes / 60);
  const feePolicyActive = policies?.noShowFeePolicy ?? false;

  const cancellationAllowed = useMemo(() => {
    if (!reservation) return false;
    if (!CANCELLABLE_STATUSES.includes(reservation.status)) return false;
    const slotStart = Date.parse(reservation.slotStartUtc);
    if (!Number.isFinite(slotStart)) return false;
    const diffMinutes = (slotStart - Date.now()) / 60000;
    return diffMinutes >= cancellationWindowMinutes;
  }, [reservation, cancellationWindowMinutes]);

  const allowEdits = useMemo(() => {
    if (!reservation) return false;
    if (reservation.status === 'CANCELLED') return false;
    const slotStart = Date.parse(reservation.slotStartUtc);
    if (!Number.isFinite(slotStart)) return false;
    const diffMinutes = (slotStart - Date.now()) / 60000;
    return diffMinutes >= modifyWindowMinutes;
  }, [reservation, modifyWindowMinutes]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation || !allowEdits) return;
    setSaving(true);
    setSaveState('idle');
    setSaveError(null);
    try {
      const updated = await updateReservation(reservation.id, {
        guestName: editName.trim() || reservation.guestName,
        guestPhone: editPhone.trim() || null,
        guestEmail: editEmail.trim() ? editEmail.trim() : null,
      });
      setReservation(updated);
      setEditName(updated.guestName);
      setEditPhone(updated.guestPhone ?? '');
      setEditEmail(updated.guestEmail ?? '');
      setSaveState('success');
    } catch (error) {
      setSaveState('error');
      setSaveError(getErrorMessage(error, ''));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!reservation || !cancellationAllowed) return;
    setCancelProcessing(true);
    setCancelState('idle');
    setCancelError(null);
    try {
      const updated = await updateReservationStatus(
        reservation.id,
        'CANCELLED' as ReservationStatus,
      );
      setReservation(updated);
      setCancelState('success');
    } catch (error) {
      setCancelState('error');
      setCancelError(getErrorMessage(error, ''));
    } finally {
      setCancelProcessing(false);
    }
  }

  const statusLabel = reservation
    ? formatStatus(reservation.status, t)
    : '';

  const tableLabel =
    reservation?.tableLabel ??
    reservation?.tableId ??
    t('review.table.auto');
  const summaryPhone =
    reservation?.guestPhone?.trim() || t('review.notProvided');
  const summaryEmail =
    reservation?.guestEmail?.trim() || t('review.notProvided');

  return (
    <main className="bg-slate-50 min-h-screen">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            {t('review.success.manage')}
          </h1>
          <p className="text-sm text-gray-600">
            {t('review.success.code')}: <span className="font-mono">{code}</span>
          </p>
        </header>

        {loading && (
          <div
            role="status"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
          >
            {t('reservation.lookup.loading')}
          </div>
        )}

        {!loading && errorKey === 'fetch' && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {errorMessage || t('reservation.lookup.error')}
          </div>
        )}

        {!loading && errorKey === 'not-found' && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {t('reservation.lookup.notFound')}
          </div>
        )}

        {!loading && reservation && (
          <section className="space-y-6">
            <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {t('reservation.summary.heading')}
              </h2>
              <p className="text-sm text-gray-600">
                {t('reservation.summary.slot', {
                  date: formatDate(reservation.slotLocalDate, locale),
                  time: formatTime(
                    reservation.slotLocalDate,
                    reservation.slotLocalTime,
                    locale,
                  ),
                })}
              </p>
              <p className="text-sm text-gray-600">
                {t('reservation.summary.party', {
                  party: reservation.partySize,
                })}
              </p>
              <p className="text-sm text-gray-600">
                {t('reservation.summary.table', { table: tableLabel })}
              </p>
              <p className="text-sm text-gray-600">
                {t('reservation.summary.status', { status: statusLabel })}
              </p>
              <p className="text-sm text-gray-600">
                {t('reservation.summary.contact', {
                  name: reservation.guestName,
                  phone: summaryPhone,
                })}
              </p>
              <p className="text-sm text-gray-600">
                {t('reservation.summary.email', { email: summaryEmail })}
              </p>
            </article>

            {policyError && (
              <div
                role="alert"
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                {policyError}
              </div>
            )}

            <form
              onSubmit={handleSave}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
            >
              <h3 className="text-base font-semibold text-gray-900">
                {t('reservation.edit.heading')}
              </h3>
              <p className="text-sm text-gray-600">
                {modifyWindowMinutes > 0
                  ? allowEdits
                    ? t('reservation.edit.allowed', { hours: modifyWindowHours })
                    : t('reservation.edit.closed')
                  : t('reservation.edit.always')}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="reservation-edit-name"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('reservation.edit.name')}
                  </label>
                  <input
                    id="reservation-edit-name"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    disabled={!allowEdits}
                    value={editName}
                    onChange={(event) => {
                      setEditName(event.target.value);
                      setSaveState('idle');
                      setSaveError(null);
                    }}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reservation-edit-phone"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('reservation.edit.phone')}
                  </label>
                  <input
                    id="reservation-edit-phone"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    disabled={!allowEdits}
                    value={editPhone}
                    onChange={(event) => {
                      setEditPhone(event.target.value);
                      setSaveState('idle');
                      setSaveError(null);
                    }}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>
                <div className="md:col-span-2">
                  <label
                    htmlFor="reservation-edit-email"
                    className="text-sm font-medium text-gray-700"
                  >
                    {t('reservation.edit.email')}
                  </label>
                  <input
                    id="reservation-edit-email"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    disabled={!allowEdits}
                    value={editEmail}
                    onChange={(event) => {
                      setEditEmail(event.target.value);
                      setSaveState('idle');
                      setSaveError(null);
                    }}
                    autoComplete="email"
                    type="email"
                  />
                </div>
              </div>
              {saveState === 'success' && (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                >
                  {t('reservation.edit.success')}
                </div>
              )}
              {saveState === 'error' && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  {saveError || t('reservation.edit.error')}
                </div>
              )}
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={!allowEdits || saving}
              >
                {saving
                  ? t('reservation.edit.processing')
                  : t('reservation.edit.submit')}
              </button>
            </form>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-gray-900">
                {t('reservation.cancel.heading')}
              </h3>
              <p className="text-sm text-gray-600">
                {cancellationAllowed
                  ? cancellationWindowMinutes > 0
                    ? t('reservation.cancel.allowed', { hours: windowHours })
                    : t('reservation.cancel.always')
                  : t('reservation.cancel.closed')}
              </p>
              {feePolicyActive && (
                <p className="text-xs text-rose-600">
                  {t('reservation.cancel.feeNotice')}
                </p>
              )}
              {cancelState === 'success' && (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                >
                  {t('reservation.cancel.success')}
                </div>
              )}
              {cancelState === 'error' && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  {cancelError || t('reservation.cancel.error')}
                </div>
              )}
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-rose-500 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                disabled={!cancellationAllowed || cancelProcessing}
                onClick={() => void handleCancel()}
              >
                {cancelProcessing
                  ? t('reservation.cancel.processing')
                  : t('reservation.cancel.button')}
              </button>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}

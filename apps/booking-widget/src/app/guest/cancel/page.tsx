'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import {
  ApiError,
  cancelGuestReservation,
  getGuestReservation,
} from '@/lib/api';
import type { GuestReservationSummary } from '@/lib/types';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

export default function GuestCancelPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [reservation, setReservation] =
    useState<GuestReservationSummary | null>(null);
  const [pageState, setPageState] = useState<PageState>(
    token ? 'loading' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setReservation(null);
      setPageState('idle');
      setErrorMessage('Add the ?token=... value from your email to cancel.');
      return;
    }
    setPageState('loading');
    setErrorMessage(null);
    getGuestReservation(token)
      .then((data) => {
        setReservation(data);
        setPageState('ready');
      })
      .catch((error) => {
        setReservation(null);
        setErrorMessage(describeGuestError(error));
        setPageState('error');
      });
  }, [token]);

  const linkExpiresAt = useMemo(() => {
    if (!reservation?.token.expiresAt) return null;
    try {
      return new Date(reservation.token.expiresAt).toLocaleString();
    } catch {
      return reservation.token.expiresAt;
    }
  }, [reservation]);

  const handleCancel = async () => {
    if (!token || !reservation) return;
    setSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const updated = await cancelGuestReservation(token);
      setReservation(updated);
      setSuccessMessage('Your reservation is now cancelled.');
    } catch (error) {
      setActionError(describeGuestError(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <GuestErrorState
        title="Missing link token"
        message="Add the ?token=... value from your email to cancel your reservation."
      />
    );
  }

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center text-gray-600">Loading your link...</div>
      </div>
    );
  }

  if (pageState === 'error' || !reservation) {
    return (
      <GuestErrorState
        title="We couldn’t load your reservation"
        message={errorMessage ?? 'Please try the link again.'}
      />
    );
  }

  const cancelDisabled =
    !reservation.canCancel ||
    reservation.status === 'CANCELLED' ||
    submitting;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="text-center">
          <p className="text-sm uppercase tracking-wide text-gray-500">
            Guest Self-Service
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">
            Cancel Reservation
          </h1>
          <p className="mt-2 text-gray-600">
            If you can’t make it, let the venue know with a single tap.
          </p>
          {linkExpiresAt && (
            <p className="mt-1 text-sm text-gray-500">
              Link valid until {linkExpiresAt}
            </p>
          )}
        </header>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <p className="text-sm font-medium text-gray-500">Reservation</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-4">
              <div>
                <p className="text-2xl font-semibold text-gray-900">
                  {reservation.venue.name}
                </p>
                <p className="text-sm text-gray-500">
                  Code {reservation.code} · {reservation.guestNameMasked}
                </p>
              </div>
              <StatusBadge status={reservation.status} />
            </div>
          </div>
          <dl className="grid gap-4 px-6 py-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Date</dt>
              <dd className="text-lg font-semibold text-gray-900">
                {formatLocalDate(reservation.slotLocalDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Time</dt>
              <dd className="text-lg font-semibold text-gray-900">
                {reservation.slotLocalTime}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Party Size</dt>
              <dd className="text-lg font-semibold text-gray-900">
                {reservation.partySize}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Cancellation</dt>
              <dd className="text-lg font-semibold text-gray-900">
                {reservation.canCancel
                  ? 'Available online'
                  : 'Window closed'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Confirm cancellation
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            This will release your table and notify the venue immediately.
          </p>

          {successMessage && (
            <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </p>
          )}

          {actionError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionError}
            </p>
          )}

          {!successMessage && !reservation.canCancel && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Online cancellations have closed for this reservation. Please call
              the venue directly if you need assistance.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelDisabled}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-600 px-4 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
            >
              {submitting ? 'Cancelling…' : 'Yes, cancel this reservation'}
            </button>
            <Link
              href="/"
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900 transition hover:bg-gray-50"
            >
              Back to availability
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function describeGuestError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return 'This link is invalid or has expired.';
    }
    if (error.status === 404) {
      return 'We could not find that reservation.';
    }
    if (error.status === 409) {
      return (
        error.message ||
        'This reservation can no longer be cancelled online.'
      );
    }
  }
  return 'Something went wrong. Please try again or contact the venue.';
}

function formatLocalDate(value: string) {
  try {
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return value;
  }
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'CANCELLED'
      ? 'bg-red-100 text-red-700'
      : status === 'CONFIRMED'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${color}`}
    >
      {status}
    </span>
  );
}

function GuestErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Guest Self-Service
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-gray-600">{message}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-900 transition hover:bg-gray-50"
        >
          Back to availability
        </Link>
      </div>
    </div>
  );
}

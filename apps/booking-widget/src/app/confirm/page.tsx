'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createReservation } from '@/lib/api-client';

export default function ConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const holdId = searchParams.get('holdId') || '';
  const tenantId = searchParams.get('tenantId') || '';
  const guestName = searchParams.get('guestName') || '';
  const guestEmail = searchParams.get('guestEmail') || '';
  const guestPhone = searchParams.get('guestPhone') || '';
  const notes = searchParams.get('notes') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<any>(null);

  useEffect(() => {
    if (!holdId || !tenantId || !guestName) {
      router.push('/');
      return;
    }
    confirmReservation();
  }, []);

  async function confirmReservation() {
    setLoading(true);
    setError(null);

    try {
      const result = await createReservation({
        venueId: tenantId,
        holdId,
        guestName,
        guestEmail: guestEmail || undefined,
        guestPhone: guestPhone || undefined,
        notes: notes || undefined,
      });

      setReservation(result);
    } catch (err: any) {
      setError(err.message || 'Failed to confirm reservation');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
          <p className="text-gray-600">Confirming your reservation...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Reservation Failed</h1>
          <p className="mb-6 text-gray-600">{error || 'Something went wrong'}</p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Try Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Success Message */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-8 w-8 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Reservation Confirmed!</h1>
          <p className="mt-2 text-gray-600">
            Thank you, {reservation.guestName}! Your table is reserved.
          </p>
        </div>

        {/* Reservation Details */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-emerald-50 px-6 py-4">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">Confirmation Code</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{reservation.code}</p>
            </div>
          </div>

          <div className="space-y-4 px-6 py-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Guest Name</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {reservation.guestName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-500">Party Size</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {reservation.partySize} {reservation.partySize === 1 ? 'Guest' : 'Guests'}
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-500">Date & Time</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {formatDate(reservation.slotLocalDate)}
              </p>
              <p className="mt-1 text-2xl font-bold text-black">
                {reservation.slotLocalTime}
              </p>
            </div>

            {reservation.tableLabel && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-500">Table</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  Table {reservation.tableLabel}
                </p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-500">Status</p>
              <p className="mt-1">
                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                  {reservation.status.charAt(0) + reservation.status.slice(1).toLowerCase()}
                </span>
              </p>
            </div>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 text-center text-sm text-gray-600">
            <p>
              A confirmation email will be sent to you shortly.
              {guestEmail && ` (${guestEmail})`}
            </p>
            <p className="mt-2">
              Save your confirmation code: <span className="font-semibold text-gray-900">{reservation.code}</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-semibold text-gray-900 hover:bg-gray-50"
          >
            Make Another Reservation
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-block rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-semibold text-gray-900 hover:bg-gray-50"
          >
            Print Confirmation
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Need to modify or cancel?{' '}
            <Link href="/manage" className="font-semibold text-black hover:underline">
              Manage your reservation
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

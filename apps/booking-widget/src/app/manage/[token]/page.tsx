'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from '@/lib/i18n';
import type { Reservation } from '@/lib/types';

export default function ManageReservationPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useLocale();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    loadReservation();
  }, [token]);

  async function loadReservation() {
    setLoading(true);
    setError(null);

    try {
      // TODO: Implement API call to get reservation by token
      // const response = await fetch(`/api/reservations/by-token/${token}`);
      // const data = await response.json();
      // setReservation(data);
      
      // Mock data for now
      setReservation({
        id: 'res-123',
        code: 'ABC123',
        venueId: 'venue-brooklyn',
        guestName: 'John Doe',
        guestEmail: 'john@example.com',
        guestPhone: '+1234567890',
        partySize: 2,
        slotLocalDate: '2025-11-10',
        slotLocalTime: '19:00',
        slotStartUtc: '2025-11-10T19:00:00Z',
        durationMinutes: 120,
        status: 'CONFIRMED',
        tableId: 'BK-101',
        tableLabel: '101',
        tableArea: 'Main Dining',
        tableCapacity: 4,
        notes: null,
        channel: 'widget',
        createdBy: 'guest',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hold: null,
        conflicts: { reservations: [], holds: [] },
      });
    } catch (err) {
      setError('Could not load reservation. Please check your link.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!reservation) return;

    setActionLoading(true);
    setActionError(null);

    try {
      // TODO: Implement cancel API call
      // await updateReservationStatus(reservation.id, 'cancelled');
      
      // Mock success
      setReservation({ ...reservation, status: 'CANCELLED' });
      setShowCancelConfirm(false);
    } catch (err) {
      setActionError('Could not cancel reservation. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleModify() {
    // TODO: Navigate to modify flow
    router.push(`/?code=${reservation?.code}`);
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  function formatStatus(status: string) {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
          <p className="text-gray-600">Loading your reservation...</p>
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
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            Reservation Not Found
          </h1>
          <p className="mb-6 text-gray-600">
            {error || 'The reservation link is invalid or has expired.'}
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Make a New Reservation
          </Link>
        </div>
      </div>
    );
  }

  const isCancelled = reservation.status === 'CANCELLED';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Your Reservation
          </h1>
          <p className="mt-2 text-gray-600">
            Confirmation Code: <span className="font-semibold">{reservation.code}</span>
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Status Badge */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Status</span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  isCancelled
                    ? 'bg-red-100 text-red-800'
                    : reservation.status === 'CONFIRMED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-800'
                }`}
              >
                {formatStatus(reservation.status)}
              </span>
            </div>
          </div>

          {/* Reservation Details */}
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

            {reservation.guestEmail && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="mt-1 text-gray-900">{reservation.guestEmail}</p>
              </div>
            )}

            {reservation.guestPhone && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-500">Phone</p>
                <p className="mt-1 text-gray-900">{reservation.guestPhone}</p>
              </div>
            )}

            {reservation.notes && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-500">Notes</p>
                <p className="mt-1 text-gray-700">{reservation.notes}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {!isCancelled && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleModify}
                  disabled={actionLoading}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                >
                  Modify Reservation
                </button>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={actionLoading}
                  className="flex-1 rounded-lg border border-red-300 bg-white px-6 py-3 text-center font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel Reservation
                </button>
              </div>

              {actionError && (
                <p className="mt-3 text-sm text-red-600">{actionError}</p>
              )}
            </div>
          )}

          {isCancelled && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 text-center">
              <p className="text-gray-600">This reservation has been cancelled.</p>
              <Link
                href="/"
                className="mt-3 inline-block text-sm font-semibold text-black hover:underline"
              >
                Make a New Reservation
              </Link>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              Cancel Reservation?
            </h2>
            <p className="mb-6 text-gray-600">
              Are you sure you want to cancel your reservation for{' '}
              {reservation.partySize} on {formatDate(reservation.slotLocalDate)} at{' '}
              {reservation.slotLocalTime}? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={actionLoading}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
              >
                Keep Reservation
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

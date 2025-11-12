'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getAvailability, createHold } from '@/lib/api-client';

export default function HoldPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tenantId = searchParams.get('tenantId') || searchParams.get('venueId') || '';
  const date = searchParams.get('date') || '';
  const time = searchParams.get('time') || '';
  const partySize = parseInt(searchParams.get('partySize') || '2');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableInfo, setTableInfo] = useState<any>(null);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (!tenantId || !date || !time) {
      router.push('/');
      return;
    }
    loadTableInfo();
  }, [tenantId, date, time, partySize]);

  async function loadTableInfo() {
    try {
      const result = await getAvailability({
        venueId: tenantId,
        date,
        time,
        partySize,
      });
      setTableInfo(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load table information');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!termsAccepted) {
      setError('Please accept the terms and conditions');
      return;
    }

    if (!tableInfo || tableInfo.tables.length === 0) {
      setError('No tables available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Pick first available table
      const table = tableInfo.tables[0];

      const hold = await createHold({
        venueId: tenantId,
        date,
        time,
        partySize,
        tableId: table.id,
        createdBy: 'guest-widget',
      });

      // Navigate to confirmation with hold ID and guest details
      const params = new URLSearchParams({
        holdId: hold.id,
        tenantId,
        guestName,
        guestEmail,
        guestPhone,
        notes,
      });

      router.push(`/confirm?${params}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create reservation hold');
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

  if (!tableInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/availability?tenantId=${tenantId}&date=${date}&partySize=${partySize}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Guest Details</h1>
        </div>

        {/* Reservation Summary */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Your Reservation</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Date:</span>
              <span className="font-medium text-gray-900">{formatDate(date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Time:</span>
              <span className="font-medium text-gray-900">{time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Party Size:</span>
              <span className="font-medium text-gray-900">
                {partySize} {partySize === 1 ? 'Guest' : 'Guests'}
              </span>
            </div>
            {tableInfo.tables[0] && (
              <div className="flex justify-between">
                <span className="text-gray-600">Table:</span>
                <span className="font-medium text-gray-900">
                  {tableInfo.tables[0].label}
                  {tableInfo.tables[0].area && ` · ${tableInfo.tables[0].area}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Guest Form */}
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="guestName" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="guestEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="guestEmail"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label htmlFor="guestPhone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                id="guestPhone"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                placeholder="+1 234 567 8900"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Special Requests
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                placeholder="Dietary restrictions, accessibility needs, etc."
              />
            </div>

            <div className="flex items-start">
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
              />
              <label htmlFor="terms" className="ml-2 text-sm text-gray-600">
                I agree to the terms and conditions and privacy policy
              </label>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating Reservation...' : 'Confirm Reservation'}
          </button>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantId, setTenantId] = useState('');
  const [date, setDate] = useState('');
  const [partySize, setPartySize] = useState('2');

  useEffect(() => {
    // Read from URL params
    const urlTenantId = searchParams.get('tenantId') || searchParams.get('venueId');
    const urlDate = searchParams.get('date');
    const urlPartySize = searchParams.get('partySize');

    // If all required params present, redirect to availability
    if (urlTenantId && urlDate && urlPartySize) {
      router.push(
        `/availability?tenantId=${urlTenantId}&date=${urlDate}&partySize=${urlPartySize}`
      );
      return;
    }

    // Otherwise, pre-fill form with URL params or defaults
    setTenantId(urlTenantId || 'venue-brooklyn');
    setDate(urlDate || getTodayISO());
    setPartySize(urlPartySize || '2');
  }, [searchParams, router]);

  function getTodayISO(): string {
    const date = new Date();
    return date.toISOString().split('T')[0];
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/availability?tenantId=${tenantId}&date=${date}&partySize=${partySize}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Book a Table</h1>
          <p className="mt-2 text-gray-600">Find your perfect dining experience</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {/* Venue/Tenant ID */}
            <div>
              <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700 mb-1">
                Restaurant
              </label>
              <input
                type="text"
                id="tenantId"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                placeholder="venue-brooklyn"
              />
            </div>

            {/* Date */}
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                type="date"
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                min={getTodayISO()}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            {/* Party Size */}
            <div>
              <label htmlFor="partySize" className="block text-sm font-medium text-gray-700 mb-1">
                Party Size
              </label>
              <select
                id="partySize"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'Guest' : 'Guests'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-black px-6 py-3 text-center font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            Check Availability
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have a reservation?{' '}
            <Link href="/manage" className="font-semibold text-black hover:underline">
              Manage it here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

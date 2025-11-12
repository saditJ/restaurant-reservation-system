'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getAvailability } from '@/lib/api-client';

export default function AvailabilityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const tenantId = searchParams.get('tenantId') || searchParams.get('venueId') || '';
  const date = searchParams.get('date') || '';
  const partySize = parseInt(searchParams.get('partySize') || '2');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<Array<{ time: string; available: boolean }>>([]);
  const [availabilityData, setAvailabilityData] = useState<any>(null);

  useEffect(() => {
    if (!tenantId || !date) {
      router.push('/');
      return;
    }
    loadAvailabilitySlots();
  }, [tenantId, date, partySize]);

  async function loadAvailabilitySlots() {
    setLoading(true);
    setError(null);

    try {
      // Generate time slots from 10:00 to 23:00 in 15-minute intervals
      const slots: Array<{ time: string; available: boolean }> = [];
      
      for (let hour = 10; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          
          try {
            const result = await getAvailability({
              venueId: tenantId,
              date,
              time: timeStr,
              partySize,
            });
            
            slots.push({
              time: timeStr,
              available: result.tables.length > 0,
            });
            
            // Store first successful availability data for table info
            if (!availabilityData && result.tables.length > 0) {
              setAvailabilityData(result);
            }
          } catch (err) {
            slots.push({
              time: timeStr,
              available: false,
            });
          }
        }
      }

      setTimeSlots(slots);
    } catch (err: any) {
      setError(err.message || 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }

  function handleTimeSelect(time: string) {
    // Navigate to hold creation with selected time
    router.push(
      `/hold?tenantId=${tenantId}&date=${date}&time=${time}&partySize=${partySize}`
    );
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
          <p className="text-gray-600">Checking availability...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-4 text-red-600">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">Error Loading Availability</h2>
          <p className="mb-6 text-gray-600">{error}</p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
          >
            Try Again
          </Link>
        </div>
      </div>
    );
  }

  const availableSlots = timeSlots.filter((slot) => slot.available);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4">
            <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Select Time</h1>
          <p className="mt-2 text-gray-600">
            {formatDate(date)} · {partySize} {partySize === 1 ? 'Guest' : 'Guests'}
          </p>
        </div>

        {/* Availability Grid */}
        {availableSlots.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-lg font-medium text-gray-900">No availability found</p>
            <p className="mt-2 text-gray-600">
              Please try a different date or party size.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
            >
              Change Search
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">
                {availableSlots.length} time{availableSlots.length !== 1 ? 's' : ''} available
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {timeSlots.map((slot) =>
                slot.available ? (
                  <button
                    key={slot.time}
                    onClick={() => handleTimeSelect(slot.time)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-center font-medium text-gray-900 hover:border-black hover:bg-gray-50 transition-colors"
                  >
                    {slot.time}
                  </button>
                ) : (
                  <div
                    key={slot.time}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center text-gray-400 line-through"
                  >
                    {slot.time}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

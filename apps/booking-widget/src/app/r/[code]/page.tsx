'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { updateReservationStatus, getVenueSettings, fetchAvailability, VENUE_ID } from '@/lib/api';
import type { Reservation, VenueSettings } from '@/lib/types';
import { TimePicker } from '@/components/TimePicker';

// Smart Time Picker that only shows available slots
function SmartTimePicker({ value, onChange, availableSlots }: { 
  value: string; 
  onChange: (time: string) => void;
  availableSlots: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleTimeSelect = (time: string) => {
    onChange(time);
    setIsOpen(false);
  };

  if (availableSlots.length === 0) {
    return (
      <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-400">
        No available times
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <input
          type="text"
          value={value}
          readOnly
          onClick={() => setIsOpen(true)}
          placeholder="Select time"
          className="w-full cursor-pointer rounded-lg border border-gray-300 px-3 py-2 pr-10 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="sticky top-0 bg-white px-3 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200">
            Select Time ({availableSlots.length} available)
          </div>
          <div className="grid grid-cols-4 gap-2 p-3">
            {availableSlots.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => handleTimeSelect(time)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  value === time
                    ? 'bg-black text-white shadow-md'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:shadow-sm'
                }`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManageReservationByCodePage() {
  const params = useParams();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [venueSettings, setVenueSettings] = useState<VenueSettings | null>(null);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [editForm, setEditForm] = useState({
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    notes: '',
    partySize: 2,
    date: '',
    time: '',
  });

  useEffect(() => {
    if (code) {
      loadReservation();
      loadVenueSettings();
    }
  }, [code]);

  async function loadVenueSettings() {
    try {
      const settings = await getVenueSettings(VENUE_ID);
      setVenueSettings(settings);
    } catch (err) {
      console.error('Failed to load venue settings:', err);
    }
  }

  async function loadReservation() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/reservations/by-code/${code}`);
      if (!response.ok) {
        let message = 'Reservation not found';
        try {
          const payload = await response.json();
          if (payload && typeof payload.error === 'string' && payload.error) {
            message = payload.error;
          }
        } catch {}
        throw new Error(message);
      }
      const data = await response.json();
      setReservation(data);
      // Initialize edit form with current values
      setEditForm({
        guestName: data.guestName || '',
        guestPhone: data.guestPhone || '',
        guestEmail: data.guestEmail || '',
        notes: data.notes || '',
        partySize: data.partySize || 2,
        date: data.slotLocalDate || '',
        time: data.slotLocalTime || '',
      });
    } catch (err: any) {
      setError(err.message || 'Could not load reservation');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!reservation) return;

    setActionLoading(true);
    setActionError(null);

    try {
      await updateReservationStatus(reservation.id, 'CANCELLED');
      setReservation({ ...reservation, status: 'CANCELLED' });
      setShowCancelConfirm(false);
    } catch (err: any) {
      setActionError(err.message || 'Could not cancel reservation');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveEdit() {
    if (!reservation) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const response = await fetch(`/api/reservations/${reservation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: editForm.guestName.trim() || undefined,
          guestPhone: editForm.guestPhone.trim() || undefined,
          guestEmail: editForm.guestEmail.trim() || undefined,
          notes: editForm.notes.trim() || undefined,
          partySize: editForm.partySize,
          date: editForm.date !== reservation.slotLocalDate ? editForm.date : undefined,
          time: editForm.time !== reservation.slotLocalTime ? editForm.time : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update reservation');
      }

      const updated = await response.json();
      setReservation(updated);
      setIsEditing(false);
    } catch (err: any) {
      setActionError(err.message || 'Could not update reservation');
    } finally {
      setActionLoading(false);
    }
  }

  function handleCancelEdit() {
    if (!reservation) return;
    // Reset form to current reservation values
    setEditForm({
      guestName: reservation.guestName || '',
      guestPhone: reservation.guestPhone || '',
      guestEmail: reservation.guestEmail || '',
      notes: reservation.notes || '',
      partySize: reservation.partySize || 2,
      date: reservation.slotLocalDate || '',
      time: reservation.slotLocalTime || '',
    });
    setIsEditing(false);
    setActionError(null);
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  function formatStatus(status: string) {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  // Generate available time slots based on venue hours for a specific date
  function getAvailableTimeSlots(date: string): string[] {
    if (!venueSettings?.hours) {
      // Default hours if not configured
      return generateTimeSlots('10:00', '23:00');
    }

    const dayOfWeek = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayHours = venueSettings.hours[dayOfWeek];
    
    if (!dayHours || dayHours.length === 0) {
      return []; // Closed on this day
    }

    // Combine all time ranges for the day
    const allSlots: string[] = [];
    for (const range of dayHours) {
      const slots = generateTimeSlots(range.start, range.end);
      allSlots.push(...slots);
    }

    // Remove duplicates and sort
    return [...new Set(allSlots)].sort();
  }

  function generateTimeSlots(start: string, end: string): string[] {
    const slots: string[] = [];
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    
    let hour = startHour;
    let minute = startMin;
    
    while (hour < endHour || (hour === endHour && minute <= endMin)) {
      const h = String(hour).padStart(2, '0');
      const m = String(minute).padStart(2, '0');
      slots.push(`${h}:${m}`);
      
      minute += 15;
      if (minute >= 60) {
        minute = 0;
        hour++;
      }
    }
    
    return slots;
  }

  // Check if a date is disabled (e.g., no operating hours, blackout)
  function isDateDisabled(dateStr: string): boolean {
    if (!venueSettings?.hours) return false;
    
    const dayOfWeek = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayHours = venueSettings.hours[dayOfWeek];
    
    return !dayHours || dayHours.length === 0;
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
            {error || 'The reservation code is invalid.'}
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

          <div className="space-y-4 px-6 py-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">Guest Name</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.guestName}
                    onChange={(e) => setEditForm({ ...editForm, guestName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    placeholder="Guest name"
                  />
                ) : (
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {reservation.guestName}
                  </p>
                )}
              </div>
              <div className="ml-4 text-right">
                <p className="text-sm font-medium text-gray-500">Party Size</p>
                {isEditing ? (
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={editForm.partySize}
                    onChange={(e) => setEditForm({ ...editForm, partySize: parseInt(e.target.value) || 1 })}
                    className="mt-1 w-20 rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  />
                ) : (
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {reservation.partySize} {reservation.partySize === 1 ? 'Guest' : 'Guests'}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-500">Date & Time</p>
              {isEditing ? (
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                    <input
                      type="date"
                      value={editForm.date}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setEditForm({ ...editForm, date: newDate });
                        // Reset time if the new date has no available slots
                        const availableSlots = getAvailableTimeSlots(newDate);
                        if (availableSlots.length === 0) {
                          setEditForm(prev => ({ ...prev, time: '', date: newDate }));
                        } else if (!availableSlots.includes(editForm.time)) {
                          // If current time is not available on new date, reset it
                          setEditForm(prev => ({ ...prev, time: '', date: newDate }));
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    {editForm.date && isDateDisabled(editForm.date) && (
                      <p className="mt-1 text-xs text-red-600">
                        ⚠️ The venue is closed on this day. Please select another date.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
                    {editForm.date && !isDateDisabled(editForm.date) ? (
                      <SmartTimePicker
                        value={editForm.time}
                        onChange={(time) => setEditForm({ ...editForm, time })}
                        availableSlots={getAvailableTimeSlots(editForm.date)}
                      />
                    ) : (
                      <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-400">
                        {editForm.date ? 'No available times' : 'Select a date first'}
                      </div>
                    )}
                  </div>
                  {(editForm.date !== reservation.slotLocalDate || editForm.time !== reservation.slotLocalTime) && (
                    <p className="text-xs text-amber-600">
                      ⚠️ Changing date/time may result in a different table assignment based on availability.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {formatDate(reservation.slotLocalDate)}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-black">
                    {reservation.slotLocalTime}
                  </p>
                </>
              )}
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
              <p className="text-sm font-medium text-gray-500">Email</p>
              {isEditing ? (
                <input
                  type="email"
                  value={editForm.guestEmail}
                  onChange={(e) => setEditForm({ ...editForm, guestEmail: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  placeholder="email@example.com"
                />
              ) : (
                <p className="mt-1 text-gray-900">{reservation.guestEmail || '—'}</p>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-500">Phone</p>
              {isEditing ? (
                <input
                  type="tel"
                  value={editForm.guestPhone}
                  onChange={(e) => setEditForm({ ...editForm, guestPhone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  placeholder="+1234567890"
                />
              ) : (
                <p className="mt-1 text-gray-900">{reservation.guestPhone || '—'}</p>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-500">Notes</p>
              {isEditing ? (
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  rows={3}
                  placeholder="Special requests or dietary restrictions"
                />
              ) : (
                <p className="mt-1 text-gray-700">{reservation.notes || '—'}</p>
              )}
            </div>
          </div>

          {!isCancelled && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
              {isEditing ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleCancelEdit}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg bg-black px-6 py-3 text-center font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {actionLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => setIsEditing(true)}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Modify Details
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg border border-red-300 bg-white px-6 py-3 text-center font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Cancel Reservation
                  </button>
                </div>
              )}

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

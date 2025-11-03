'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { apiJSON, formatApiError } from '@/lib/api';
import type { Reservation, ReservationStatus } from '@/lib/types';

function resolveVenueId(): string {
  const raw = process.env.NEXT_PUBLIC_VENUE_ID;
  if (typeof raw !== 'string') return 'venue-main';
  const trimmed = raw.trim();
  if (!trimmed) return 'venue-main';
  const normalized = trimmed.toLowerCase();
  if (normalized === 'undefined' || normalized === 'null') {
    return 'venue-main';
  }
  return trimmed;
}

const VENUE_ID = resolveVenueId();

type Props = {
  open: boolean;
  onClose: () => void;
  onCreateOptimistic: (temp: Reservation) => void;
  onReplaceWithServer: (tempId: string, server: Reservation) => void;
  onCreateRollback: (tempId: string) => void;
};

type DraftReservation = {
  status: ReservationStatus;
  code: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  slotLocalDate: string;
  slotLocalTime: string;
  partySize: number;
  tableId: string;
  notes: string;
};

const INITIAL_DRAFT = (): DraftReservation => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const MM = String(now.getMinutes()).padStart(2, '0');
  return {
    status: 'PENDING',
    code: '',
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    slotLocalDate: `${yyyy}-${mm}-${dd}`,
    slotLocalTime: `${HH}:${MM}`,
    partySize: 2,
    tableId: '',
    notes: '',
  };
};

export default function ReservationNewModal({
  open,
  onClose,
  onCreateOptimistic,
  onReplaceWithServer,
  onCreateRollback,
}: Props) {
  const [form, setForm] = useState<DraftReservation>(INITIAL_DRAFT);
  const [creating, setCreating] = useState(false);

  const updateForm = (updates: Partial<DraftReservation>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  useEffect(() => {
    if (open) {
      setForm(INITIAL_DRAFT());
    }
  }, [open]);

  if (!open) return null;

  function canCreate() {
    if (!form.guestName.trim()) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.slotLocalDate)) return false;
    if (!/^\d{2}:\d{2}$/.test(form.slotLocalTime)) return false;
    if (!form.partySize || form.partySize < 1 || form.partySize > 50) return false;
    return true;
  }

  async function create() {
    if (!canCreate()) return;
    setCreating(true);
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const optimistic: Reservation = {
      id: tempId,
      venueId: VENUE_ID,
      code: form.code || '',
      status: form.status,
      guestName: form.guestName,
      guestPhone: form.guestPhone,
      guestEmail: form.guestEmail,
      partySize: form.partySize,
      slotLocalDate: form.slotLocalDate,
      slotLocalTime: form.slotLocalTime,
      slotStartUtc: new Date(`${form.slotLocalDate}T${form.slotLocalTime}:00Z`).toISOString(),
      durationMinutes: 120,
      tableId: form.tableId || null,
      tableLabel: null,
      tableArea: null,
      tableCapacity: null,
      notes: form.notes || null,
      channel: 'staff-console',
      createdBy: 'ui',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hold: null,
      conflicts: { reservations: [], holds: [] },
    };

    onCreateOptimistic(optimistic);

    try {
      const guestName = form.guestName.trim() || 'Walk-in';
      const phone = form.guestPhone.trim();
      const email = form.guestEmail.trim();
      const server = await apiJSON<Reservation>('/reservations', 'POST', {
        code: form.code || undefined,
        status: form.status,
        guest: {
          name: guestName,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        },
        venueId: VENUE_ID,
        date: form.slotLocalDate,
        time: form.slotLocalTime,
        partySize: form.partySize,
        tableId: form.tableId || undefined,
        notes: form.notes || undefined,
      });
      onReplaceWithServer(tempId, server);
      onClose();
    } catch (error: unknown) {
      const meta = formatApiError(error);
      alert(meta.message || 'Failed to create.');
      onCreateRollback(tempId);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-semibold">New reservation</div>
          <button className="text-xs opacity-60 hover:opacity-100" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Guest name</span>
            <input
              className="border rounded px-2 py-1"
              value={form.guestName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm({ guestName: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Status</span>
            <select
              className="border rounded px-2 py-1"
              value={form.status}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateForm({ status: event.target.value as ReservationStatus })
              }
            >
              {['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED'].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Phone</span>
            <input
              className="border rounded px-2 py-1"
              value={form.guestPhone}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm({ guestPhone: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Email</span>
            <input
              className="border rounded px-2 py-1"
              value={form.guestEmail}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm({ guestEmail: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Date</span>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={form.slotLocalDate}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ slotLocalDate: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Time</span>
            <input
              type="text" inputMode="numeric" pattern="^([0-1]\\d|2[0-3]):[0-5]\\d$" placeholder="HH:MM"
              className="border rounded px-2 py-1"
              value={form.slotLocalTime}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ slotLocalTime: event.target.value })
              }
              lang="en-GB"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Party size</span>
            <input
              type="number"
              min={1}
              max={50}
              className="border rounded px-2 py-1"
              value={form.partySize}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const parsed = Number.parseInt(event.target.value || '2', 10);
                const partySize = Number.isFinite(parsed) && parsed > 0 ? parsed : form.partySize;
                updateForm({ partySize });
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Table</span>
            <input
              className="border rounded px-2 py-1"
              value={form.tableId}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm({ tableId: event.target.value })}
              placeholder="optional"
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs opacity-70">Notes</span>
            <input
              className="border rounded px-2 py-1"
              value={form.notes}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm({ notes: event.target.value })}
              placeholder="optional"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button className="px-3 py-1 rounded border text-xs hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-50"
            disabled={!canCreate() || creating}
            onClick={create}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

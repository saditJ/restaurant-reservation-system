'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { apiJSON, formatApiError } from '@/lib/api';
import type { Reservation, ReservationStatus } from '@/lib/types';

type Props = {
  open: boolean;
  initial: Reservation | null;
  onClose: () => void;
  onSave: (updated: Reservation) => void;
  onDelete: (id: string) => void;
  onRestore: (row: Reservation) => void;
};

const STATUS_OPTIONS: ReservationStatus[] = [
  'PENDING',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
];

export default function ReservationEditModal({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
  onRestore,
}: Props) {
  const [form, setForm] = useState<Reservation | null>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const prev = useRef<Reservation | null>(null);

  const updateForm = useCallback((updates: Partial<Reservation>) => {
    setForm((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  useEffect(() => {
    setForm(initial);
    prev.current = initial;
  }, [initial, open]);

  const canSave = useMemo(() => {
    if (!form) return false;
    const { slotLocalDate, slotLocalTime, partySize } = form;
    if (!slotLocalDate || !/^\d{4}-\d{2}-\d{2}$/.test(slotLocalDate)) return false;
    if (!slotLocalTime || !/^\d{2}:\d{2}$/.test(slotLocalTime)) return false;
    if (!partySize || Number.isNaN(partySize) || partySize < 1 || partySize > 50) return false;
    return true;
  }, [form]);

  if (!open || !form) return null;

  const patchBody = (payload: Reservation) => ({
    code: payload.code ?? undefined,
    guestName: payload.guestName ?? undefined,
    guestPhone: payload.guestPhone ?? undefined,
    guestEmail: payload.guestEmail ?? undefined,
    date: payload.slotLocalDate ?? undefined,
    time: payload.slotLocalTime ?? undefined,
    partySize: payload.partySize ?? undefined,
    tableId: payload.tableId ?? null,
    status: payload.status,
    notes: payload.notes ?? undefined,
    channel: payload.channel ?? undefined,
    durationMinutes: payload.durationMinutes ?? undefined,
  });

  async function save() {
    if (!form) return;
    setSaving(true);

    onSave(form); // optimistic
    try {
      const server = await apiJSON<Reservation>(`/reservations/${form.id}`, 'PATCH', patchBody(form));
      onSave(server);
      onClose();
    } catch (error: unknown) {
      const meta = formatApiError(error);
      alert(meta.message || 'Failed to save changes.');
      if (prev.current) onSave(prev.current);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form) return;
    if (!confirm('Delete this reservation?')) return;
    setDeleting(true);
    const snapshot = form;
    onDelete(form.id);
    try {
      await apiJSON<void>(`/reservations/${form.id}`, 'DELETE');
      onClose();
    } catch (error: unknown) {
      const meta = formatApiError(error);
      alert(`${meta.message || 'Failed to delete reservation.'}\n\nRestoring previous state.`);
      onRestore(snapshot);
    } finally {
      setDeleting(false);
    }
  }

  const conflictCount =
    (form.conflicts?.reservations?.length ?? 0) + (form.conflicts?.holds?.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-semibold">Edit reservation</div>
          <button className="text-xs opacity-60 hover:opacity-100" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Code</span>
            <input
              className="border rounded px-2 py-1"
              value={form.code || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm({ code: event.target.value })}
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
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Guest name</span>
            <input
              className="border rounded px-2 py-1"
              value={form.guestName || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ guestName: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Phone</span>
            <input
              className="border rounded px-2 py-1"
              value={form.guestPhone || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ guestPhone: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Email</span>
            <input
              className="border rounded px-2 py-1"
              value={form.guestEmail || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ guestEmail: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Channel</span>
            <input
              className="border rounded px-2 py-1"
              value={form.channel || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ channel: event.target.value })
              }
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Date</span>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={form.slotLocalDate || ''}
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
              value={form.slotLocalTime || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ slotLocalTime: event.target.value })
              }
              lang="en-GB"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Duration (min)</span>
            <input
              type="number"
              min={15}
              max={360}
              className="border rounded px-2 py-1"
              value={form.durationMinutes || 0}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const value = Number(event.target.value);
                const duration = Number.isFinite(value) ? value : form.durationMinutes ?? 0;
                updateForm({ durationMinutes: duration });
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Party size</span>
            <input
              type="number"
              min={1}
              max={50}
              className="border rounded px-2 py-1"
              value={form.partySize || 1}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const parsed = Number.parseInt(event.target.value || '1', 10);
                const partySize = Number.isFinite(parsed) && parsed > 0 ? parsed : form.partySize ?? 1;
                updateForm({ partySize });
              }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Table</span>
            <input
              className="border rounded px-2 py-1"
              value={form.tableId || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const value = event.target.value.trim();
                updateForm({
                  tableId: value || null,
                  tableLabel: null,
                });
              }}
              placeholder="e.g. T12"
            />
          </label>
          {form.tables && form.tables.length > 0 && (
            <div className="col-span-2 text-[11px] text-gray-500">
              Assigned tables:{' '}
              {form.tables
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((table) => table.label ?? table.tableId)
                .join(' + ')}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Notes</span>
            <input
              className="border rounded px-2 py-1"
              value={form.notes || ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateForm({ notes: event.target.value })
              }
            />
          </label>

          {form.hold && (
            <div className="col-span-2 rounded border bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <div className="text-sm font-semibold">Converted from hold</div>
              <div className="mt-1">Hold ID: {form.hold.id}</div>
              <div>
                Held slot: {form.hold.slotLocalDate} at {form.hold.slotLocalTime} - party{' '}
                {form.hold.partySize}
              </div>
              <div>
                Table: {form.hold.tableLabel || form.hold.tableId || 'Auto-assign'} - Status:{' '}
                {form.hold.status}
              </div>
              <div>
                Created at {new Date(form.hold.createdAt).toLocaleString()} - Expires{' '}
                {new Date(form.hold.expiresAt).toLocaleString()}
              </div>
            </div>
          )}

          {conflictCount > 0 && (
            <div className="col-span-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="text-sm font-semibold">Conflicts detected</div>
              {form.conflicts.reservations.length > 0 && (
                <div className="mt-1">
                  Overlapping reservations:{' '}
                  {form.conflicts.reservations
                    .map((c) => `${c.slotLocalTime} (${c.status}) ${c.code}`)
                    .join(', ')}
                </div>
              )}
              {form.conflicts.holds.length > 0 && (
                <div>
                  Active holds:{' '}
                  {form.conflicts.holds
                    .map((c) => `${c.slotLocalTime} (${c.status})`)
                    .join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            className="px-3 py-1 rounded border text-xs hover:bg-gray-50"
            onClick={remove}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded border text-xs hover:bg-gray-50" onClick={onClose}>
              Cancel
            </button>
            <button
              className="px-3 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-50"
              disabled={!canSave || saving}
              onClick={save}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

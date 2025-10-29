'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiJSON, formatApiError } from '@/lib/api';
import { formatSlot, formatVenueTime } from '@/lib/time';
import type { AvailabilityResponse, AvailabilityTable, Hold, Reservation } from '@/lib/types';

type ToastState = { message: string; tone: 'info' | 'success' | 'error' } | null;

type HoldsClientProps = {
  initialDate: string;
  initialTime: string;
  initialParty: number;
  initialHolds: Hold[];
  initialAvailability: AvailabilityTable[];
  venueId?: string | null;
};

type ConvertDraft = {
  name: string;
  phone: string;
  email: string;
};

const SECONDS_BEFORE_EXPIRY_LOCK = 30;

function secondsUntilExpiry(hold: Hold, now: number) {
  const expires = new Date(hold.expiresAt).getTime();
  if (!Number.isFinite(expires)) return -Infinity;
  return Math.floor((expires - now) / 1000);
}

function canConvertHold(hold: Hold, now: number) {
  if (hold.status !== 'HELD') return false;
  return secondsUntilExpiry(hold, now) >= SECONDS_BEFORE_EXPIRY_LOCK;
}

export default function HoldsClient({
  initialDate,
  initialTime,
  initialParty,
  initialHolds,
  initialAvailability,
  venueId,
}: HoldsClientProps) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [party, setParty] = useState(initialParty);

  const [loadingAvail, setLoadingAvail] = useState(false);
  const [avail, setAvail] = useState<AvailabilityTable[]>(initialAvailability);
  const [loadingHolds, setLoadingHolds] = useState(false);
  const [holds, setHolds] = useState<Hold[]>(initialHolds);
  const [toast, setToast] = useState<ToastState>(null);
  const [creatingHold, setCreatingHold] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [convertTarget, setConvertTarget] = useState<Hold | null>(null);
  const [convertDraft, setConvertDraft] = useState<ConvertDraft>({ name: '', phone: '', email: '' });
  const [convertError, setConvertError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const venueQuery = venueId && venueId.trim().length > 0 ? venueId.trim() : null;

  const refreshAvail = useCallback(async () => {
    setLoadingAvail(true);
    try {
      const params = new URLSearchParams();
      params.set('date', date);
      params.set('time', time);
      params.set('partySize', String(party));
      if (venueQuery) params.set('venueId', venueQuery);
      const response = await apiGet<AvailabilityResponse>(`/availability?${params.toString()}`);
      setAvail(response.tables);
    } catch (error: unknown) {
      const meta = formatApiError(error);
      const code = meta.code ?? (meta.status !== undefined ? String(meta.status) : '');
      setToast({
        message: `Availability error: ${meta.message}${code ? ` (${code})` : ''}`,
        tone: 'error',
      });
    } finally {
      setLoadingAvail(false);
    }
  }, [date, time, party, venueQuery]);

  const refreshHolds = useCallback(async () => {
    setLoadingHolds(true);
    try {
      const params = new URLSearchParams();
      params.set('date', date);
      if (venueQuery) params.set('venueId', venueQuery);
      const response = await apiGet<{ items: Hold[]; total: number }>(`/holds?${params.toString()}`);
      setHolds(response.items);
    } catch (error: unknown) {
      const meta = formatApiError(error);
      const code = meta.code ?? (meta.status !== undefined ? String(meta.status) : '');
      setToast({
        message: `Holds error: ${meta.message}${code ? ` (${code})` : ''}`,
        tone: 'error',
      });
    } finally {
      setLoadingHolds(false);
    }
  }, [date, venueQuery]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setAvail(initialAvailability);
  }, [initialAvailability]);

  useEffect(() => {
    setHolds(initialHolds);
  }, [initialHolds]);

  useEffect(() => {
    void refreshAvail();
    void refreshHolds();
  }, [refreshAvail, refreshHolds]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const heldTableIds = useMemo(
    () =>
      new Set(
        holds
          .map((h) => h.booking.tableId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    [holds],
  );

  async function createHold(tableId?: string) {
    if (creatingHold) return;
    setCreatingHold(true);
    try {
      const body: Record<string, unknown> = {
        date,
        time,
        partySize: party,
      };
      if (venueQuery) body.venueId = venueQuery;
      if (tableId) body.tableId = tableId;
      const created = await apiJSON<Hold>('/holds', 'POST', body);
      setHolds((prev) => {
        const next = prev.filter((item) => item.id !== created.id);
        return [created, ...next];
      });
      setToast({ message: 'Hold created', tone: 'success' });
      void refreshAvail();
    } catch (error: unknown) {
      const meta = formatApiError(error);
      const code = meta.code ?? (meta.status !== undefined ? String(meta.status) : '');
      setToast({
        message: `Create hold failed: ${meta.message}${code ? ` (${code})` : ''}`,
        tone: 'error',
      });
    } finally {
      setCreatingHold(false);
    }
  }

  async function releaseHold(id: string) {
    setReleasingId(id);
    let removed: Hold | null = null;
    let index = -1;
    setHolds((prev) => {
      const pos = prev.findIndex((item) => item.id === id);
      if (pos === -1) return prev;
      index = pos;
      removed = prev[pos];
      const next = [...prev];
      next.splice(pos, 1);
      return next;
    });
    try {
      await apiJSON<void>(`/holds/${id}`, 'DELETE');
      setToast({ message: 'Hold released', tone: 'success' });
      void refreshAvail();
    } catch (error: unknown) {
      if (removed) {
        const restore = removed;
        setHolds((prev) => {
          if (prev.some((item) => item.id === id)) return prev;
          const next = [...prev];
          const position = index >= 0 && index <= next.length ? index : next.length;
          next.splice(position, 0, restore);
          return next;
        });
      }
      const meta = formatApiError(error);
      const code = meta.code ?? (meta.status !== undefined ? String(meta.status) : '');
      setToast({
        message: `Release failed: ${meta.message}${code ? ` (${code})` : ''}`,
        tone: 'error',
      });
    } finally {
      setReleasingId((current) => (current === id ? null : current));
    }
  }

  function openConvertModal(hold: Hold) {
    setConvertTarget(hold);
    setConvertDraft({
      name: hold.booking.tableLabel ?? 'Walk-in',
      phone: '',
      email: '',
    });
    setConvertError(null);
  }

  function closeConvertModal() {
    if (convertingId) return;
    setConvertTarget(null);
    setConvertDraft({ name: '', phone: '', email: '' });
    setConvertError(null);
  }

  async function submitConvert() {
    const target = convertTarget;
    if (!target) return;
    const guestName = convertDraft.name.trim() || 'Walk-in';
    const phone = convertDraft.phone.trim();
    const email = convertDraft.email.trim();
    const payload: Record<string, unknown> = {
      holdId: target.id,
      guest: {
        name: guestName,
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
      },
    };

    setConvertingId(target.id);
    setConvertError(null);
    try {
      const reservation = await apiJSON<Reservation>('/reservations', 'POST', payload);
      setToast({
        message: `Hold converted to reservation ${reservation.code || reservation.id}`,
        tone: 'success',
      });
      setHolds((prev) => prev.filter((item) => item.id !== target.id));
      setConvertTarget(null);
      setConvertDraft({ name: '', phone: '', email: '' });
      void refreshAvail();
    } catch (error: unknown) {
      const meta = formatApiError(error);
      const code = meta.code ?? (meta.status !== undefined ? String(meta.status) : '');
      setConvertError(meta.message || 'Failed to convert hold.');
      setToast({
        message: `Convert failed${code ? ` (${code})` : ''}`,
        tone: 'error',
      });
    } finally {
      void refreshHolds();
      setConvertingId((current) => (current === target.id ? null : current));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Holds</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm text-gray-600">Date</label>
          <input
            className="border rounded px-3 py-2"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Time</label>
          <input
            className="border rounded px-3 py-2"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Party</label>
          <input
            className="border rounded px-3 py-2 w-24"
            type="number"
            min={1}
            max={50}
            value={party}
            onChange={(event) => {
              const next = Number(event.target.value || 1);
              setParty(Number.isFinite(next) ? next : 1);
            }}
          />
        </div>
        <button
          className="px-4 py-2 rounded bg-black text-white"
          onClick={() => {
            void refreshAvail();
            void refreshHolds();
          }}
        >
          Refresh
        </button>
        <button
          className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
          onClick={() => createHold(undefined)}
          disabled={creatingHold}
        >
          {creatingHold ? 'Creating...' : 'Hold best-fit table'}
        </button>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-medium">Available tables</h2>
          {loadingAvail && <span className="text-sm text-gray-500">loading...</span>}
        </div>
        {avail.length === 0 ? (
          <div className="text-gray-600">No tables available for this slot.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {avail.map((table) => (
              <div key={table.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{table.label}</div>
                  <div className="text-xs text-gray-600">
                    Capacity: {table.capacity}
                    {table.area ? ` ${'\u00b7'} ${table.area}` : ''}
                  </div>
                  {heldTableIds.has(table.id) && (
                    <div className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      HELD
                    </div>
                  )}
                </div>
                <button
                  className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white disabled:opacity-50"
                  onClick={() => createHold(table.id)}
                  disabled={heldTableIds.has(table.id) || creatingHold}
                  title={heldTableIds.has(table.id) ? 'Already held' : 'Place hold'}
                >
                  Hold
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-medium">Active holds ({holds.length})</h2>
          {loadingHolds && <span className="text-sm text-gray-500">loading...</span>}
        </div>
        {holds.length === 0 ? (
          <div className="text-gray-600">No active holds for this date.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {holds.map((hold) => {
              const converting = convertingId === hold.id;
              const releasing = releasingId === hold.id;
              const convertible = canConvertHold(hold, nowMs);
              const secondsLeft = secondsUntilExpiry(hold, nowMs);
              return (
                <div key={hold.id} className="border rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {hold.booking.tableLabel ?? hold.booking.tableId ?? 'Any table'}
                    </div>
                    <div className="text-xs text-gray-600">
                      {formatSlot(hold.booking.date, hold.booking.time)} {'\u00b7'} party {hold.booking.partySize}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span>expires {formatVenueTime(hold.expiresAt, { hour12: true })}</span>
                      {secondsLeft > 0 && (
                        <span className={secondsLeft < 60 ? 'text-amber-600' : ''}>
                          {secondsLeft}s left
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <button
                      className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white disabled:opacity-50"
                      onClick={() => openConvertModal(hold)}
                      disabled={!convertible || converting || releasing}
                    >
                      {converting ? 'Converting...' : 'Convert'}
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white disabled:opacity-50"
                      onClick={() => releaseHold(hold.id)}
                      disabled={releasing || converting}
                    >
                      {releasing ? 'Releasing...' : 'Release'}
                    </button>
                    {!convertible && hold.status === 'HELD' && (
                      <div className="text-[11px] text-amber-600 text-right">
                        Conversion locked when &lt;{SECONDS_BEFORE_EXPIRY_LOCK}s remain
                      </div>
                    )}
                    {hold.status !== 'HELD' && (
                      <div className="text-[11px] text-gray-500 text-right">{hold.status}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {convertTarget && (
        <ConvertModal
          hold={convertTarget}
          draft={convertDraft}
          onChange={setConvertDraft}
          onClose={closeConvertModal}
          onSubmit={submitConvert}
          submitting={convertingId === convertTarget.id}
          error={convertError}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 rounded px-4 py-2 shadow text-white ${
            toast.tone === 'error'
              ? 'bg-rose-600'
              : toast.tone === 'success'
              ? 'bg-emerald-600'
              : 'bg-black'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

type ConvertModalProps = {
  hold: Hold;
  draft: ConvertDraft;
  submitting: boolean;
  error: string | null;
  onChange: (draft: ConvertDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
};

function ConvertModal({ hold, draft, submitting, error, onChange, onSubmit, onClose }: ConvertModalProps) {
  const durationLabel = formatSlot(hold.booking.date, hold.booking.time);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-semibold">Convert hold</div>
            <div className="text-xs text-gray-500">
              {durationLabel} {'\u00b7'} party {hold.booking.partySize}
            </div>
          </div>
          <button className="text-xs opacity-60 hover:opacity-100" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </div>

        <form
          className="space-y-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (submitting) return;
            onSubmit();
          }}
        >
          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Guest name</span>
              <input
                className="border rounded px-3 py-2"
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                placeholder="Walk-in guest"
              />
            </label>
          </div>
          <div className="flex gap-3">
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-gray-500">Phone</span>
              <input
                className="border rounded px-3 py-2"
                value={draft.phone}
                onChange={(event) => onChange({ ...draft, phone: event.target.value })}
                placeholder="+355 123 4567"
              />
            </label>
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-gray-500">Email</span>
              <input
                className="border rounded px-3 py-2"
                value={draft.email}
                onChange={(event) => onChange({ ...draft, email: event.target.value })}
                placeholder="guest@example.com"
              />
            </label>
          </div>

          {error && <div className="text-xs text-rose-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-3 py-2 rounded border text-xs hover:bg-gray-50 disabled:opacity-50"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-emerald-600 text-white text-xs disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? 'Converting...' : 'Convert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}










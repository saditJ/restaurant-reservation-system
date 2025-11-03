'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, formatApiError } from '@/lib/api';
import { formatRange, formatSlot } from '@/lib/time';
import type {
  AvailabilityResponse,
  Reservation,
  ReservationConflictHold,
  ReservationListResponse,
} from '@/lib/types';
import HealthBadge from '../components/HealthBadge';

type FloorClientProps = {
  initialDate: string;
  initialTime: string;
  initialPartySize: number;
  venueId?: string | null;
  initialAvailability: AvailabilityResponse | null;
  initialReservations: Reservation[];
};

type TableSummary = {
  id: string;
  label: string;
  area: string;
  capacity: number | null;
  reservations: Reservation[];
  holds: ReservationConflictHold[];
  isReserved: boolean;
  isHeld: boolean;
};

const AUTO_REFRESH_MS = 30_000;
const DEFAULT_RESERVATION_LIMIT = 400;

const normalizeTime = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return trimmed;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2] ?? '0')));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const isHttpUrl = (value: string | null | undefined) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
};

export default function FloorClient({
  initialDate,
  initialTime,
  initialPartySize,
  venueId,
  initialAvailability,
  initialReservations,
}: FloorClientProps) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [partySize, setPartySize] = useState(initialPartySize);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(initialAvailability);
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(() => Date.now());
  const venueQuery = venueId && venueId.trim().length > 0 ? venueId.trim() : null;
  const venueFilter = useMemo(
    () => (venueQuery && !isHttpUrl(venueQuery) ? venueQuery : null),
    [venueQuery],
  );
  const hasInitialData = initialAvailability !== null;
  const didInitRef = useRef(false);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const availabilityParams = new URLSearchParams();
    availabilityParams.set('date', date);
    availabilityParams.set('time', time);
    availabilityParams.set('partySize', String(partySize));
    if (venueFilter) availabilityParams.set('venueId', venueFilter);

    const reservationsParams = new URLSearchParams();
    reservationsParams.set('date', date);
    reservationsParams.set('limit', String(DEFAULT_RESERVATION_LIMIT));
    reservationsParams.set('offset', '0');
    reservationsParams.set('includeConflicts', '1');
    if (venueFilter) reservationsParams.set('venueId', venueFilter);

    try {
      const [availabilityResponse, reservationsResponse] = await Promise.all([
        apiGet<AvailabilityResponse>(`/availability?${availabilityParams.toString()}`),
        apiGet<ReservationListResponse>(`/reservations?${reservationsParams.toString()}`),
      ]);
      setAvailability(availabilityResponse);
      setReservations(reservationsResponse.items ?? []);
      setLastUpdated(Date.now());
    } catch (err) {
      const meta = formatApiError(err);
      setError(meta.message || 'Failed to refresh floor data.');
    } finally {
      setLoading(false);
    }
  }, [date, time, partySize, venueFilter]);

  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      if (!hasInitialData) {
        void refreshData();
      }
      return;
    }
    void refreshData();
  }, [date, time, partySize, refreshData, hasInitialData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshData();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshData]);

  const tables = useMemo<TableSummary[]>(() => {
    if (!availability) return [];
    const nowMs = Date.now();
    const holdMap = new Map<string, ReservationConflictHold[]>();
    for (const hold of availability.conflicts.holds) {
      if (!hold.tableId) continue;
      if (hold.status !== 'HELD') continue;
      const expires = new Date(hold.expiresAt).getTime();
      if (!Number.isFinite(expires) || expires < nowMs) continue;
      const bucket = holdMap.get(hold.tableId) ?? [];
      bucket.push(hold);
      holdMap.set(hold.tableId, bucket);
    }

    const reservationsForSlot = reservations.filter(
      (reservation) =>
        reservation.slotLocalDate === date &&
        reservation.slotLocalTime === time &&
        reservation.status !== 'CANCELLED',
    );
    const reservationMap = new Map<string, Reservation[]>();
    for (const reservation of reservationsForSlot) {
      const tableIds =
        reservation.tables && reservation.tables.length > 0
          ? reservation.tables
              .map((table) => table.tableId)
              .filter((tableId): tableId is string => Boolean(tableId))
          : reservation.tableId
          ? [reservation.tableId]
          : [];
      for (const tableId of tableIds) {
        const bucket = reservationMap.get(tableId) ?? [];
        bucket.push(reservation);
        reservationMap.set(tableId, bucket);
      }
    }

    const baseMeta = new Map<string, { label: string; area: string; capacity: number | null }>();
    for (const table of availability.tables) {
      baseMeta.set(table.id, {
        label: table.label,
        area: table.area ?? 'Unassigned',
        capacity: table.capacity ?? null,
      });
    }

    const allTableIds = new Set<string>([
      ...availability.tables.map((table) => table.id),
      ...reservationMap.keys(),
      ...holdMap.keys(),
    ]);

    const summaries: TableSummary[] = [];
    for (const id of allTableIds) {
      const meta =
        baseMeta.get(id) ??
        (() => {
          const reservationSource = reservationMap.get(id)?.[0];
          if (!reservationSource) {
            return { label: id, area: 'Unassigned', capacity: null };
          }
          return {
            label: reservationSource.tableLabel ?? id,
            area: reservationSource.tableArea ?? 'Unassigned',
            capacity: reservationSource.tableCapacity ?? null,
          };
        })();

      const holds = holdMap.get(id) ?? [];
      const reservationList = reservationMap.get(id) ?? [];
      const isReserved = reservationList.length > 0;
      const isHeld = holds.length > 0;

      summaries.push({
        id,
        label: meta.label,
        area: meta.area,
        capacity: meta.capacity,
        reservations: reservationList,
        holds,
        isReserved,
        isHeld,
      });
    }

    return summaries.sort((a, b) => {
      if (a.area === b.area) {
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      }
      return a.area.localeCompare(b.area);
    });
  }, [availability, reservations, date, time]);

  const groupedByArea = useMemo(() => {
    return tables.reduce<Record<string, TableSummary[]>>((acc, table) => {
      if (!acc[table.area]) acc[table.area] = [];
      acc[table.area].push(table);
      return acc;
    }, {});
  }, [tables]);

  const lastUpdatedLabel = useMemo(() => {
    return new Date(lastUpdated).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [lastUpdated]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Floor overview</h1>
          <p className="text-sm text-gray-500">
            Live table availability for the selected slot. Chips update automatically every 30s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HealthBadge />
          <button
            type="button"
            className="rounded-full border px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => void refreshData()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh now'}
          </button>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-gray-500">Date</span>
          <input
            type="date"
            className="rounded border px-3 py-2"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-gray-500">Time</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="^([0-1]\\d|2[0-3]):[0-5]\\d$"
              placeholder="HH:MM"
              className="rounded border px-3 py-2"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-gray-500">Party size</span>
          <input
            type="number"
            min={1}
            max={30}
            className="w-24 rounded border px-3 py-2"
            value={partySize}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              setPartySize(Number.isFinite(next) && next > 0 ? next : initialPartySize);
            }}
          />
        </label>
        <div className="text-xs text-gray-500">
          Last update: <span className="font-medium text-gray-700">{lastUpdatedLabel}</span>
        </div>
      </section>

      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="space-y-6">
        {tables.length === 0 && !loading && (
          <div className="rounded border border-dashed px-4 py-6 text-center text-sm text-gray-500">
            No tables reported for this slot.
          </div>
        )}

        {Object.entries(groupedByArea).map(([area, entries]) => (
          <div key={area} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{area}</h2>
              <span className="text-xs text-gray-500">
                {entries.length} table{entries.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {entries.map((table) => {
                const firstReservation = table.reservations[0];
                const firstHold = table.holds[0];
                return (
                  <div
                    key={table.id}
                    className="rounded-xl border bg-white p-4 shadow-sm transition hover:shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{table.label}</div>
                        <div className="text-xs text-gray-500">
                          Capacity {table.capacity ?? 'n/a'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {table.isReserved && <StatusChip kind="reserved" label="RES" />}
                        {table.isHeld && <StatusChip kind="held" label="HELD" />}
                        {!table.isReserved && !table.isHeld && (
                          <StatusChip kind="available" label="FREE" />
                        )}
                      </div>
                    </div>

                    {table.isReserved && firstReservation && (
                      <div className="mt-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                        <div className="font-medium">
                          {firstReservation.guestName || firstReservation.code || 'Reservation'}
                        </div>
                        <div>
                          {formatSlot(firstReservation.slotLocalDate, firstReservation.slotLocalTime)} {'\u00b7'} party {firstReservation.partySize}
                        </div>
                        {firstReservation.durationMinutes > 0 && (
                          <div className="text-[11px] text-blue-600">
                            {formatRange(
                              firstReservation.slotLocalDate,
                              firstReservation.slotLocalTime,
                              firstReservation.durationMinutes,
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {table.isHeld && firstHold && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Hold expires{' '}
                        {new Date(firstHold.expiresAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </div>
                    )}

                    {!table.isReserved && !table.isHeld && availability && (
                      <div className="mt-3 text-xs text-gray-500">
                        Available for {partySize} at {time}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function StatusChip({ kind, label }: { kind: 'reserved' | 'held' | 'available'; label: string }) {
  const styles =
    kind === 'reserved'
      ? 'bg-red-500/10 text-red-700 border-red-200'
      : kind === 'held'
      ? 'bg-amber-500/10 text-amber-700 border-amber-200'
      : 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles}`}>
      {label}
    </span>
  );
}



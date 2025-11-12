'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchFloorplanOccupancy,
  saveFloorplan,
  formatApiError,
} from '@/lib/api';
import type {
  FloorplanOccupancy,
  FloorplanResponse,
  FloorplanRoom,
  FloorplanTable,
} from '@/lib/types';

type FloorplanEditorProps = {
  venueId: string;
  initialData: FloorplanResponse;
};

type TableModel = FloorplanTable;

const MAX_DIMENSION = 5000;
const OCCUPANCY_REFRESH_MS = 15_000;
const DEFAULT_TABLE_WIDTH = 120;
const DEFAULT_TABLE_HEIGHT = 80;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const SHAPES: FloorplanTable['shape'][] = ['rect', 'circle', 'booth'];

export default function FloorplanEditor({
  venueId,
  initialData,
}: FloorplanEditorProps) {
  const [room, setRoom] = useState<FloorplanRoom>(initialData.room);
  const [tables, setTables] = useState<TableModel[]>(
    () => initialData.tables.map((table) => ({ ...table })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialData.tables[0]?.id ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOccupancy, setShowOccupancy] = useState(false);
  const [occupancy, setOccupancy] = useState<FloorplanOccupancy | null>(null);
  const [occupancyError, setOccupancyError] = useState<string | null>(null);
  const [occupancyUpdatedAt, setOccupancyUpdatedAt] = useState<number | null>(
    null,
  );
  const [loadingOverlay, setLoadingOverlay] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const roomRef = useRef(room);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    setRoom(initialData.room);
    setTables(initialData.tables.map((table) => ({ ...table })));
    setSelectedId(initialData.tables[0]?.id ?? null);
    setDirty(false);
  }, [initialData]);

  const gridSize = useMemo(
    () => Math.max(1, room.grid || 1),
    [room.grid],
  );

  const busySet = useMemo(
    () => new Set(occupancy?.busyTableIds ?? []),
    [occupancy],
  );
  const holdSet = useMemo(
    () => new Set(occupancy?.holdsTableIds ?? []),
    [occupancy],
  );

  const selectedTable = tables.find((table) => table.id === selectedId) ?? null;

  const updateRoomField = useCallback(
    (field: keyof FloorplanRoom, value: number) => {
      setRoom((prev) => {
        const min = field === 'grid' ? 1 : 0;
        const nextValue = clamp(Math.round(value), min, MAX_DIMENSION);
        if (prev[field] === nextValue) return prev;
        setDirty(true);
        return { ...prev, [field]: nextValue };
      });
    },
    [],
  );

  const updateTable = useCallback(
    (id: string, updater: Partial<TableModel> | ((table: TableModel) => Partial<TableModel>)) => {
      let changed = false;
      setTables((prev) =>
        prev.map((table) => {
          if (table.id !== id) return table;
          const patch =
            typeof updater === 'function' ? updater(table) : updater;
          const next = { ...table, ...patch };
          changed =
            changed ||
            Object.entries(patch).some(([key, value]) => {
              return (table as Record<string, unknown>)[key] !== value;
            });
          return next;
        }),
      );
      if (changed) {
        setDirty(true);
      }
    },
    [],
  );

  const addTable = useCallback(() => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tbl_${Date.now()}`;
    const baseName = `Table ${tables.length + 1}`;
    const defaultX = clamp(
      Math.round((room.w - DEFAULT_TABLE_WIDTH) / 2),
      0,
      Math.max(room.w - DEFAULT_TABLE_WIDTH, 0),
    );
    const defaultY = clamp(
      Math.round((room.h - DEFAULT_TABLE_HEIGHT) / 2),
      0,
      Math.max(room.h - DEFAULT_TABLE_HEIGHT, 0),
    );
    const nextTable: TableModel = {
      id,
      name: baseName,
      min: 2,
      max: 4,
      x: defaultX,
      y: defaultY,
      angle: 0,
      shape: 'rect',
      w: DEFAULT_TABLE_WIDTH,
      h: DEFAULT_TABLE_HEIGHT,
      zone: null,
    };
    setTables((prev) => [...prev, nextTable]);
    setSelectedId(id);
    setDirty(true);
  }, [room.h, room.w, tables.length]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setTables((prev) => {
      const next = prev.filter((table) => table.id !== selectedId);
      const fallbackId = next.at(-1)?.id ?? next.at(0)?.id ?? null;
      setSelectedId((current) =>
        current === selectedId ? fallbackId : current ?? fallbackId,
      );
      return next;
    });
    setDirty(true);
  }, [selectedId]);

  const rotateSelected = useCallback(
    (delta: number) => {
      if (!selectedId) return;
      updateTable(selectedId, (table) => ({
        angle: normalizeAngle(table.angle + delta),
      }));
    },
    [selectedId, updateTable],
  );

  const moveSelectedBy = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!selectedId || (!deltaX && !deltaY)) return;
      const grid = Math.max(1, roomRef.current.grid || 1);
      const stepX = Math.round(deltaX / grid) * grid;
      const stepY = Math.round(deltaY / grid) * grid;
      if (!stepX && !stepY) return;
      setTables((prev) =>
        prev.map((table) => {
          if (table.id !== selectedId) return table;
          const maxX = Math.max(roomRef.current.w - table.w, 0);
          const maxY = Math.max(roomRef.current.h - table.h, 0);
          const nextX = clamp(table.x + stepX, 0, maxX);
          const nextY = clamp(table.y + stepY, 0, maxY);
          if (nextX === table.x && nextY === table.y) return table;
          setDirty(true);
          return { ...table, x: nextX, y: nextY };
        }),
      );
    },
    [selectedId],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent, table: TableModel) => {
      if (event.button !== 0) return;
      event.preventDefault();
      setSelectedId(table.id);
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const offsetX = event.clientX - rect.left - table.x;
      const offsetY = event.clientY - rect.top - table.y;
      dragRef.current = { id: table.id, offsetX, offsetY };
    },
    [],
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg) return;
      const rect = svg.getBoundingClientRect();
      const rawX = event.clientX - rect.left - drag.offsetX;
      const rawY = event.clientY - rect.top - drag.offsetY;
      const grid = Math.max(1, roomRef.current.grid || 1);
      let changed = false;
      setTables((prev) =>
        prev.map((table) => {
          if (table.id !== drag.id) return table;
          const maxX = Math.max(roomRef.current.w - table.w, 0);
          const maxY = Math.max(roomRef.current.h - table.h, 0);
          const snappedX = clamp(
            Math.round(rawX / grid) * grid,
            0,
            maxX,
          );
          const snappedY = clamp(
            Math.round(rawY / grid) * grid,
            0,
            maxY,
          );
          if (snappedX === table.x && snappedY === table.y) {
            return table;
          }
          changed = true;
          return { ...table, x: snappedX, y: snappedY };
        }),
      );
      if (changed) {
        setDirty(true);
      }
    };

    const handleUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!selectedId) return;
      const tag = (event.target as HTMLElement | null)?.tagName ?? '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag.toUpperCase())) {
        return;
      }
      const baseStep = Math.max(1, roomRef.current.grid || 1);
      const step = event.shiftKey ? baseStep * 5 : baseStep;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          moveSelectedBy(-step, 0);
          break;
        case 'ArrowRight':
          event.preventDefault();
          moveSelectedBy(step, 0);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveSelectedBy(0, -step);
          break;
        case 'ArrowDown':
          event.preventDefault();
          moveSelectedBy(0, step);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [moveSelectedBy, selectedId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const payload = {
        room,
        tables: tables.map((table) => ({
          id: table.id,
          name: table.name,
          min: table.min,
          max: table.max,
          x: table.x,
          y: table.y,
          angle: table.angle,
          shape: table.shape,
          w: table.w,
          h: table.h,
          zone: table.zone,
        })),
      };
      const updated = await saveFloorplan(venueId, payload);
      setRoom(updated.room);
      setTables(updated.tables.map((table) => ({ ...table })));
      setDirty(false);
      setStatus('Changes saved');
    } catch (err) {
      const meta = formatApiError(err);
      setError(meta.message || 'Failed to save floorplan');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 4000);
    }
  }, [room, tables, venueId]);

  const fetchOverlay = useCallback(async () => {
    setLoadingOverlay(true);
    setOccupancyError(null);
    try {
      const snapshot = await fetchFloorplanOccupancy(
        venueId,
        new Date().toISOString(),
      );
      setOccupancy(snapshot);
      setOccupancyUpdatedAt(Date.now());
    } catch (err) {
      const meta = formatApiError(err);
      setOccupancyError(meta.message || 'Failed to load occupancy');
      setOccupancy(null);
    } finally {
      setLoadingOverlay(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (!showOccupancy) {
      setOccupancy(null);
      setOccupancyError(null);
      return;
    }
    let cancelled = false;

    const run = async () => {
      await fetchOverlay();
    };

    void run();
    const interval = window.setInterval(() => {
      if (!cancelled) {
        void run();
      }
    }, OCCUPANCY_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchOverlay, showOccupancy]);

  const gridLines = useMemo(() => {
    const lines: JSX.Element[] = [];
    const grid = Math.max(1, room.grid || 1);
    for (let x = grid; x < room.w; x += grid) {
      lines.push(
        <line
          key={`v-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={room.h}
          stroke="#e5e7eb"
          strokeWidth={x % (grid * 5) === 0 ? 1.2 : 0.5}
        />,
      );
    }
    for (let y = grid; y < room.h; y += grid) {
      lines.push(
        <line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={room.w}
          y2={y}
          stroke="#e5e7eb"
          strokeWidth={y % (grid * 5) === 0 ? 1.2 : 0.5}
        />,
      );
    }
    return lines;
  }, [room.h, room.w, room.grid]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border p-4 shadow-sm">
        <button
          type="button"
          onClick={addTable}
          className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add Table
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selectedId}
          className="rounded-md border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => rotateSelected(-15)}
          disabled={!selectedId}
          className="rounded-md border border-gray-300 px-2.5 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Rotate -15°
        </button>
        <button
          type="button"
          onClick={() => rotateSelected(15)}
          disabled={!selectedId}
          className="rounded-md border border-gray-300 px-2.5 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Rotate +15°
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Shape
          <select
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            disabled={!selectedTable}
            value={selectedTable?.shape ?? 'rect'}
            onChange={(event) =>
              selectedTable &&
              updateTable(selectedTable.id, { shape: event.target.value as FloorplanTable['shape'] })
            }
          >
            {SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {shape}
              </option>
            ))}
          </select>
        </label>
        <label className="flex max-w-xs flex-1 items-center gap-2 text-sm text-gray-700">
          Zone
          <input
            type="text"
            disabled={!selectedTable}
            value={selectedTable?.zone ?? ''}
            onChange={(event) =>
              selectedTable &&
              updateTable(selectedTable.id, { zone: event.target.value })
            }
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showOccupancy}
            onChange={(event) => setShowOccupancy(event.target.checked)}
          />
          Show occupancy
        </label>
        {showOccupancy && (
          <button
            type="button"
            onClick={() => fetchOverlay()}
            className="rounded-md border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700"
            disabled={loadingOverlay}
          >
            Refresh overlay
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <div>
              Room: {room.w} cm × {room.h} cm
            </div>
            <div>Grid: {room.grid} cm</div>
            {showOccupancy && (
              <div>
                Overlay:{' '}
                {loadingOverlay
                  ? 'updating…'
                  : occupancyUpdatedAt
                  ? `updated ${new Date(occupancyUpdatedAt).toLocaleTimeString()}`
                  : 'pending'}
              </div>
            )}
          </div>
          <div className="overflow-auto rounded-lg border">
            <svg
              ref={svgRef}
              width={room.w}
              height={room.h}
              className="block bg-slate-50"
            >
              <rect
                x={0}
                y={0}
                width={room.w}
                height={room.h}
                fill="#f8fafc"
                stroke="#cbd5f5"
              />
              <g>{gridLines}</g>
              {tables.map((table) => {
                const occupancyState = busySet.has(table.id)
                  ? 'busy'
                  : holdSet.has(table.id)
                  ? 'hold'
                  : null;
                const fill =
                  occupancyState === 'busy'
                    ? '#fee2e2'
                    : occupancyState === 'hold'
                    ? '#fef9c3'
                    : '#ffffff';
                const stroke =
                  table.id === selectedId ? '#2563eb' : '#1f2937';
                const strokeWidth = table.id === selectedId ? 2.4 : 1.4;
                const centerX = table.x + table.w / 2;
                const centerY = table.y + table.h / 2;
                const rotate = `rotate(${table.angle} ${centerX} ${centerY})`;
                return (
                  <g
                    key={table.id}
                    onPointerDown={(event) => handlePointerDown(event, table)}
                    className="cursor-move"
                    transform={rotate}
                  >
                    {renderTableShape({
                      table,
                      fill,
                      stroke,
                      strokeWidth,
                    })}
                    <text
                      x={table.x + table.w / 2}
                      y={table.y + table.h / 2}
                      fill="#1f2937"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none' }}
                      className="text-xs font-semibold"
                    >
                      {table.name}
                    </text>
                    <text
                      x={table.x + table.w / 2}
                      y={table.y + table.h - 8}
                      fill="#475569"
                      textAnchor="middle"
                      dominantBaseline="baseline"
                      style={{ pointerEvents: 'none' }}
                      className="text-[10px]"
                    >
                      {table.min}–{table.max} seats
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {occupancyError && (
            <p className="mt-3 text-sm text-red-600">{occupancyError}</p>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Room
            </h2>
            <div className="mt-3 space-y-3">
              <label className="block text-sm text-gray-700">
                Width (cm)
                <input
                  type="number"
                  min={0}
                  max={MAX_DIMENSION}
                  value={room.w}
                  onChange={(event) =>
                    updateRoomField('w', Number(event.target.value))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm text-gray-700">
                Height (cm)
                <input
                  type="number"
                  min={0}
                  max={MAX_DIMENSION}
                  value={room.h}
                  onChange={(event) =>
                    updateRoomField('h', Number(event.target.value))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm text-gray-700">
                Grid size (cm)
                <input
                  type="number"
                  min={1}
                  max={MAX_DIMENSION}
                  value={room.grid}
                  onChange={(event) =>
                    updateRoomField('grid', Number(event.target.value))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Table
            </h2>
            {selectedTable ? (
              <div className="mt-3 space-y-3">
                <label className="block text-sm text-gray-700">
                  Name
                  <input
                    type="text"
                    value={selectedTable.name}
                    onChange={(event) =>
                      updateTable(selectedTable.id, {
                        name: event.target.value || selectedTable.name,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-gray-700">
                    Min seats
                    <input
                      type="number"
                      min={1}
                      max={selectedTable.max}
                      value={selectedTable.min}
                      onChange={(event) => {
                        const next = clamp(
                          Number(event.target.value),
                          1,
                          selectedTable.max,
                        );
                        updateTable(selectedTable.id, { min: next });
                      }}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm text-gray-700">
                    Max seats
                    <input
                      type="number"
                      min={selectedTable.min}
                      max={MAX_DIMENSION}
                      value={selectedTable.max}
                      onChange={(event) => {
                        const next = clamp(
                          Number(event.target.value),
                          selectedTable.min,
                          MAX_DIMENSION,
                        );
                        updateTable(selectedTable.id, { max: next });
                      }}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="block text-sm text-gray-700">
                  Zone
                  <input
                    type="text"
                    value={selectedTable.zone ?? ''}
                    onChange={(event) =>
                      updateTable(selectedTable.id, { zone: event.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                Select a table to edit details.
              </p>
            )}
          </div>

          <div className="border-t pt-4">
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            {status && !error && (
              <p className="mb-3 text-sm text-green-600">{status}</p>
            )}
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving || !dirty}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'All changes saved'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderTableShape({
  table,
  fill,
  stroke,
  strokeWidth,
}: {
  table: TableModel;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  switch (table.shape) {
    case 'circle': {
      const radius = Math.min(table.w, table.h) / 2;
      return (
        <circle
          cx={table.x + table.w / 2}
          cy={table.y + table.h / 2}
          r={radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    case 'booth':
      return (
        <rect
          x={table.x}
          y={table.y}
          width={table.w}
          height={table.h}
          rx={Math.min(table.w, table.h) / 4}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    default:
      return (
        <rect
          x={table.x}
          y={table.y}
          width={table.w}
          height={table.h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
  }
}

function normalizeAngle(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = numeric % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

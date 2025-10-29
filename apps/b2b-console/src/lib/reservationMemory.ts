'use client';

// Persisted client-only memory for newly confirmed reservations.
// Survives refresh via localStorage; clears on different browser/profile.

import type { Reservation } from '@/lib/types';

export type Row = {
  id: string;
  guest: string;
  phone: string;
  party: number;
  date: string;
  time: string;
  table?: string | null;
  status: 'confirmed' | 'seated' | 'completed' | 'cancelled';
};

const STORAGE_KEY = 'b2b:memReservations:v1';

const rows: Row[] = [];
const listeners = new Set<(snapshot: Row[]) => void>();
let loaded = false;

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

function loadOnce() {
  if (loaded) return;
  loaded = true;
  if (typeof window === 'undefined') return; // SSR guard
  const data = safeParse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(data)) {
    const valid = data.filter(d => d && typeof d.id === 'string' && typeof d.date === 'string');
    rows.splice(0, rows.length, ...(valid as Row[]));
  }
}

function persist() {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {}
}

function notify() {
  const snapshot = [...rows];
  listeners.forEach(fn => fn(snapshot));
}

export function addFromReservation(reservation: Reservation) {
  loadOnce();
  const r: Row = {
    id: reservation.id,
    guest: reservation.guestName || 'Walk-in',
    phone: reservation.guestPhone || '',
    party: reservation.partySize ?? 0,
    date: reservation.slotLocalDate,
    time: reservation.slotLocalTime,
    table: reservation.tableLabel ?? reservation.tableId ?? null,
    status: 'confirmed',
  };
  rows.unshift(r);
  persist();
  notify();
}

export function setStatusInMemory(id: string, status: Row['status']) {
  loadOnce();
  const idx = rows.findIndex(r => r.id === id);
  if (idx !== -1) {
    rows[idx] = { ...rows[idx], status };
    persist();
    notify();
  }
}

export function subscribeRows(fn: (rows: Row[]) => void) {
  loadOnce();
  listeners.add(fn);
  fn([...rows]); // initial push
  return () => listeners.delete(fn);
}

export function getRows(): Row[] {
  loadOnce();
  return [...rows];
}

export function clearMemory() {
  rows.splice(0, rows.length);
  persist();
  notify();
}

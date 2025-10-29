'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/api';
import { extractAvailabilityP95, extractNotificationWorkerWindow } from '@/lib/metrics';
import { formatVenueTime } from '@/lib/time';

type TrafficLight = 'loading' | 'ok' | 'warn' | 'fail';

type ReadyResponse = {
  status?: string;
  dependencies?: {
    database?: string;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

export default function StatusPage() {
  const [health, setHealth] = useState<TrafficLight>('loading');
  const [ready, setReady] = useState<TrafficLight>('loading');
  const [database, setDatabase] = useState<TrafficLight>('loading');
  const [metrics, setMetrics] = useState<TrafficLight>('loading');
  const [worker, setWorker] = useState<TrafficLight>('loading');
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [metricsNote, setMetricsNote] = useState<string | null>(null);
  const [workerNote, setWorkerNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setHealth('loading');
    setReady('loading');
    setDatabase('loading');
    setMetrics('loading');
    setMetricsNote(null);
    setWorker('loading');
    setWorkerNote(null);
    let lastError: string | null = null;

    try {
      const healthResp = await apiGet<{ status?: string; ok?: boolean }>('/health');
      const healthOk =
        typeof healthResp?.status === 'string'
          ? healthResp.status.toLowerCase() === 'ok'
          : healthResp?.ok === true;
      setHealth(healthOk ? 'ok' : 'fail');
      if (!healthOk) {
        lastError = 'API heartbeat returned a non-OK payload.';
      }
    } catch (err) {
      setHealth('fail');
      lastError = err instanceof Error ? err.message : 'API heartbeat failed';
    }

    try {
      const readyResp = await apiGet<ReadyResponse>('/ready');
      const readyOk =
        typeof readyResp?.status === 'string' && readyResp.status.toLowerCase() === 'ok';
      setReady(readyOk ? 'ok' : 'fail');

      const dbStatus = readyResp?.dependencies?.database?.toLowerCase();
      const dbOk = dbStatus === 'ok';
      setDatabase(dbOk ? 'ok' : 'fail');

      if (!readyOk || !dbOk) {
        lastError ||= 'Readiness probe reported a dependency failure.';
      }
    } catch (err) {
      setReady('fail');
      setDatabase('fail');
      const message = err instanceof Error ? err.message : 'Readiness probe failed';
      lastError ||= message;
    }

    try {
      const response = await fetch(`${API_BASE}/metrics`, { cache: 'no-store' });
      if (!response.ok) {
        setMetrics('warn');
        setMetricsNote(`Metrics endpoint returned HTTP ${response.status}.`);
        lastError ||= `Metrics endpoint returned HTTP ${response.status}.`;
        setWorker('warn');
        setWorkerNote('Metrics endpoint unavailable.');
      } else {
        const body = await response.text();
        const p95 = extractAvailabilityP95(body);
        const workerStats = extractNotificationWorkerWindow(body);

        if (p95 == null) {
          setMetrics('warn');
          setMetricsNote('Metrics reachable but no availability samples yet.');
        } else if (p95 > 2.5) {
          setMetrics('fail');
          const formatted = formatDuration(p95);
          setMetricsNote(`Availability p95 ${formatted}, above 2.5s fail threshold.`);
          lastError ||= `Availability p95 ${formatted} exceeded fail threshold.`;
        } else if (p95 > 1) {
          setMetrics('warn');
          const formatted = formatDuration(p95);
          setMetricsNote(`Availability p95 ${formatted}, above 1s target.`);
          lastError ||= `Availability p95 ${formatted} above target.`;
        } else {
          setMetrics('ok');
          setMetricsNote(`Availability p95 ${formatDuration(p95)}.`);
        }

        if (!workerStats) {
          setWorker('warn');
          setWorkerNote('No worker metrics reported yet.');
        } else if (workerStats.failed > 0) {
          setWorker('fail');
          setWorkerNote(
            `Sent ${workerStats.sent.toLocaleString()} / Failed ${workerStats.failed.toLocaleString()} (15m)`,
          );
          lastError ||= 'Notification worker has recent failures.';
        } else if (workerStats.sent === 0) {
          setWorker('warn');
          setWorkerNote('No notifications delivered in the last 15 minutes.');
        } else {
          setWorker('ok');
          setWorkerNote(`Sent ${workerStats.sent.toLocaleString()} in last 15 minutes.`);
        }
      }
    } catch (err) {
      setMetrics('warn');
      const message = err instanceof Error ? err.message : 'Failed to load metrics';
      setMetricsNote(message);
      lastError ||= message;
      setWorker('warn');
      setWorkerNote('Unable to evaluate worker metrics.');
    }

    setUpdatedAt(new Date());
    setError(lastError);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    void run();
    const interval = setInterval(() => {
      void run();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [load]);

  const formattedTime = useMemo(() => {
    if (!updatedAt) return 'N/A';
    return formatVenueTime(updatedAt, { hour12: true });
  }, [updatedAt]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">System Status</h1>
        <p className="text-sm text-gray-600">
          Current view of the API surface and dependencies. All browser requests continue to route via{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{API_BASE}</code>.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatusCard title="API /health" status={health} description="Basic heartbeat endpoint." />
        <StatusCard title="API /ready" status={ready} description="Checks dependencies via readiness probe." />
        <StatusCard title="Database" status={database} description="Prisma connectivity confirmed by /ready." />
        <StatusCard
          title="Observability"
          status={metrics}
          description="Prometheus /metrics endpoint and latency sampling."
          note={metricsNote}
        />
        <StatusCard
          title="Notification Worker"
          status={worker}
          description="Delivery performance in the last 15 minutes."
          note={workerNote}
        />
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm text-gray-600">
            <div>
              <span className="font-medium text-gray-800">Resolved API base:</span>{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{API_BASE}</code>
            </div>
            <div>
              Last updated: <span className="font-medium text-gray-800">{formattedTime}</span>
            </div>
            {error && <div className="text-rose-600">Latest refresh error: {error}</div>}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-gray-300 px-3 py-1 text-sm shadow-sm transition hover:border-gray-400 hover:shadow"
              onClick={() => void load()}
            >
              Refresh now
            </button>
            <Link href="/" className="text-sm text-blue-600 underline hover:text-blue-700">
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(2)}s`;
}

function StatusCard({
  title,
  status,
  description,
  note,
}: {
  title: string;
  status: TrafficLight;
  description: string;
  note?: string | null;
}) {
  const { label, color } = useMemo(() => {
    switch (status) {
      case 'ok':
        return { label: 'OK', color: 'bg-emerald-500' };
      case 'warn':
        return { label: 'WARN', color: 'bg-amber-500' };
      case 'fail':
        return { label: 'FAIL', color: 'bg-rose-500' };
      default:
        return { label: '...', color: 'bg-gray-300' };
    }
  }, [status]);

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <span className={`inline-flex min-w-[3.5rem] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white ${color}`}>
          {label}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-gray-600">
        <p>{description}</p>
        {note && <p className="text-xs text-gray-500">{note}</p>}
      </div>
    </div>
  );
}




'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export default function HealthBadge() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const resp = await apiGet<{ status?: string; ok?: boolean }>('/health');
        if (cancelled) return;
        const status = typeof resp?.status === 'string' ? resp.status.toLowerCase() : '';
        const nextOk = status === 'ok' || resp?.ok === true;
        setOk(nextOk);
      } catch {
        if (!cancelled) setOk(false);
      }
    };

    void check();
    const interval = setInterval(() => {
      void check();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const color = ok == null ? 'bg-gray-300' : ok ? 'bg-green-500' : 'bg-red-500';
  const label = ok == null ? '...' : ok ? 'OK' : 'DOWN';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="opacity-70">API {label}</span>
    </div>
  );
}

'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { ProviderUsageTimeseriesPoint } from '../lib/types';

type Props = {
  data: ProviderUsageTimeseriesPoint[];
};

export function UsageChart({ data }: Props) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#CBD5F5" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ fontSize: '0.75rem', borderRadius: '0.5rem' }}
            formatter={(value: number) => [value, 'Requests']}
          />
          <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

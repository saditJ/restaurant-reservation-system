import { revalidatePath } from 'next/cache';
import { listWaitlist, offerWaitlist, expireWaitlist } from '@/lib/api';
import type { WaitlistEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

function formatDateTime(value: string, timeZone: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}

function formatRelative(value: string) {
  const target = new Date(value).getTime();
  const diff = target - Date.now();
  if (!Number.isFinite(diff)) return 'n/a';
  if (diff <= 0) return 'expired';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'in <1 min';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} d`;
}

function maskOffer(code: string | null) {
  if (!code) return '-';
  if (code.length <= 4) return code;
  return `${code.slice(0, 2)}****${code.slice(-2)}`;
}

function StatusBadge({ status }: { status: WaitlistEntry['status'] }) {
  const style = {
    WAITING: 'bg-slate-100 text-slate-700 border-slate-200',
    OFFERED: 'bg-amber-100 text-amber-800 border-amber-200',
    EXPIRED: 'bg-rose-100 text-rose-700 border-rose-200',
    CONVERTED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  }[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

export default async function WaitlistPage() {
  const { items } = await listWaitlist({ limit: 50 });

  async function handleOffer(formData: FormData) {
    'use server';
    const id = String(formData.get('id') || '');
    const slotStart = String(formData.get('slotStart') || '');
    if (!id || !slotStart) return;
    await offerWaitlist(id, { slotStart });
    revalidatePath('/waitlist');
  }

  async function handleExpire(formData: FormData) {
    'use server';
    const id = String(formData.get('id') || '');
    if (!id) return;
    await expireWaitlist(id);
    revalidatePath('/waitlist');
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-gray-900">Waitlist</h1>
        <p className="text-sm text-gray-600">
          Showing the latest {items.length} entries. Offer a table or expire outstanding offers.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Desired</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Offer</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
            {items.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-4">
                  <div className="font-medium text-gray-900">{entry.name}</div>
                  <div className="text-xs text-gray-500">
                    {entry.email ?? '-'}
                    {entry.phone ? ` - ${entry.phone}` : ''}
                  </div>
                </td>
                <td className="px-4 py-4">{entry.partySize}</td>
                <td className="px-4 py-4">
                  <div>{formatDateTime(entry.desiredAt, entry.venueTimezone)}</div>
                  <div className="text-xs text-gray-500">{entry.venueName}</div>
                </td>
                <td className="px-4 py-4">{entry.priority}</td>
                <td className="px-4 py-4">
                  <StatusBadge status={entry.status} />
                </td>
                <td className="px-4 py-4">
                  {entry.status === 'OFFERED' && entry.expiresAt ? (
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">{maskOffer(entry.offerCode)}</div>
                      <div className="text-xs text-gray-500">Expires {formatRelative(entry.expiresAt)}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <form action={handleOffer}>
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="slotStart" value={entry.desiredAt} />
                      <button
                        type="submit"
                        disabled={entry.status !== 'WAITING'}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                      >
                        Offer now
                      </button>
                    </form>
                    <form action={handleExpire}>
                      <input type="hidden" name="id" value={entry.id} />
                      <button
                        type="submit"
                        disabled={entry.status !== 'OFFERED'}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                      >
                        Expire
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

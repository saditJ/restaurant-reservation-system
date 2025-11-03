import Link from 'next/link';
import HealthBadge from '../components/HealthBadge';
import { apiGet, listRecentOffers } from '@/lib/api';
import type { NotificationOutboxListResponse, WaitlistOfferSummary } from '@/lib/types';
import NotificationsClient from './NotificationsClient';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['ALL', 'PENDING', 'SENT', 'FAILED'] as const;
type FilterStatus = (typeof STATUS_FILTERS)[number];

type PageProps = {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[value.length - 1] : undefined;
  }
  return value;
}

function normalizeStatus(value: string | undefined): FilterStatus {
  if (!value) return 'ALL';
  const upper = value.toUpperCase();
  return STATUS_FILTERS.includes(upper as FilterStatus)
    ? (upper as FilterStatus)
    : 'ALL';
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const params =
    searchParams instanceof Promise ? await searchParams : searchParams ?? {};

  const statusParam = normalizeStatus(
    getStringParam(params.status)?.toString(),
  );
  const queryParam = getStringParam(params.search) ?? '';

  const pageParam = Number.parseInt(
    getStringParam(params.page) ?? '',
    10,
  );
  const page =
    Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const request = new URLSearchParams();
  request.set('limit', String(PAGE_SIZE));
  request.set('offset', String(offset));
  if (statusParam !== 'ALL') {
    request.set('status', statusParam);
  }
  if (queryParam.trim()) {
    request.set('search', queryParam.trim());
  }

  const response = await apiGet<NotificationOutboxListResponse>(
    `/notifications/outbox?${request.toString()}`,
  );
  const items = response.items ?? [];
  const total = Number.isFinite(response.total)
    ? Number(response.total)
    : items.length;

  const recentOffers = await listRecentOffers(20);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="text-xl font-semibold text-gray-900">
          Restaurant Console
        </div>
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link href="/" className="hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/reservations" className="hover:text-gray-900">
              Reservations
            </Link>
            <Link href="/floor" className="hover:text-gray-900">
              Floor
            </Link>
            <Link href="/notifications" className="font-medium text-gray-900">
              Notifications
            </Link>
            <Link href="/settings" className="hover:text-gray-900">
              Settings
            </Link>
          </nav>
          <HealthBadge />
        </div>
      </header>

      <div className="mx-auto mt-10 max-w-6xl">
        <NotificationsClient
          initialItems={items}
          initialTotal={total}
          pageSize={PAGE_SIZE}
          initialStatus={statusParam}
          initialSearch={queryParam}
          initialPage={page}
          recentOffers={recentOffers as WaitlistOfferSummary[]}
        />
      </div>
    </main>
  );
}

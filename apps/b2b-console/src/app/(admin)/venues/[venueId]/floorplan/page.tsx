import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverApi';
import type { FloorplanResponse } from '@/lib/types';
import FloorplanEditor from './FloorplanEditor';

type PageProps = {
  params: {
    venueId: string;
  };
};

export const dynamic = 'force-dynamic';

export default async function FloorplanPage({ params }: PageProps) {
  const venueParam = params.venueId ?? '';
  const venueId = venueParam.trim();
  if (!venueId) {
    notFound();
  }

  let initialData: FloorplanResponse | null = null;
  let error: string | null = null;

  try {
    initialData = await serverGet<FloorplanResponse>(
      `/venues/${encodeURIComponent(venueId)}/floorplan`,
    );
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'Failed to load floorplan';
    error = message;
  }

  if (!initialData) {
    return (
      <div className="px-6 py-8">
        <h1 className="text-2xl font-semibold">Floorplan</h1>
        <p className="mt-4 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-gray-500">Venue</p>
          <h1 className="text-2xl font-semibold">Floorplan</h1>
        </div>
        <div className="text-sm text-gray-500">Venue ID: {venueId}</div>
      </div>
      <FloorplanEditor venueId={venueId} initialData={initialData} />
    </div>
  );
}

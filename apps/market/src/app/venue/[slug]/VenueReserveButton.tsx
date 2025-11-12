'use client';

import { useState } from 'react';
import { ReserveOverlay } from '@/components/ReserveOverlay';

interface VenueReserveButtonProps {
  tenantId: string;
  venueName: string;
}

export function VenueReserveButton({
  tenantId,
  venueName,
}: VenueReserveButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="w-full rounded-lg bg-slate-900 px-6 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Reserve a Table
      </button>

      {isModalOpen && (
        <ReserveOverlay
          tenantId={tenantId}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}

import type { ReactNode } from 'react';

import { buildBookingWidgetLink } from '@/lib/links';

interface BookButtonProps {
  venueId: string;
  date?: string | Date;
  partySize?: number;
  className?: string;
  children?: ReactNode;
}

export function BookButton({
  venueId,
  date,
  partySize,
  className = '',
  children = 'Book',
}: BookButtonProps) {
  const href = buildBookingWidgetLink({ venueId, date, partySize });

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${className}`}
    >
      {children}
    </a>
  );
}

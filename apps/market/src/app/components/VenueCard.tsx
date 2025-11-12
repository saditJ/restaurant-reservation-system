import Link from 'next/link';

import type { VenueSummary } from '@/lib/api';
import { formatCuisines, formatPriceTier } from '@/lib/format';
import { BookButton } from './BookButton';

interface VenueCardProps {
  venue: VenueSummary;
}

export function VenueCard({ venue }: VenueCardProps) {
  const backgroundImage = venue.heroImageUrl
    ? `linear-gradient(180deg, rgba(17,24,39,0.55) 0%, rgba(17,24,39,0.9) 100%), url(${venue.heroImageUrl})`
    : 'linear-gradient(135deg, rgba(15,23,42,0.85) 0%, rgba(30,64,175,0.85) 100%)';
  const summary = venue.shortDescription ?? venue.description;

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-lg shadow-slate-900/5 transition hover:-translate-y-1 hover:shadow-xl">
      <div
        className="h-40 bg-cover bg-center"
        style={{ backgroundImage }}
        role="presentation"
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {venue.name}
              </h3>
              <p className="text-sm text-slate-600">
                {formatCuisines(venue.cuisines)} • {venue.city ?? 'Listed soon'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {formatPriceTier(venue.priceTier)}
              </span>
              {typeof venue.rating === 'number' && (
                <span className="text-xs font-semibold text-amber-600">
                  ⭐ {venue.rating.toFixed(1)}{' '}
                  <span className="text-slate-400">
                    ({venue.reviewCount ?? 0})
                  </span>
                </span>
              )}
            </div>
          </div>
          {summary ? (
            <p className="text-sm text-slate-500">{summary}</p>
          ) : null}
          {venue.nextAvailable && (
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Next opening {new Date(venue.nextAvailable).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/venue/${venue.slug}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 underline-offset-4 transition hover:underline"
          >
            View details
            <span aria-hidden="true">{'>'}</span>
          </Link>
          <BookButton
            venueId={venue.id}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            Book
          </BookButton>
        </div>
      </div>
    </article>
  );
}

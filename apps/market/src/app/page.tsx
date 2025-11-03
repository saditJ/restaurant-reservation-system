import { getFeaturedVenues } from '@/lib/api';
import { SearchBar } from './components/SearchBar';
import { VenueCard } from './components/VenueCard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const venues = await getFeaturedVenues();

  return (
    <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 py-16 sm:py-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Reserve Market
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            Discover venues worth crossing town for
          </h1>
          <p className="max-w-2xl text-balance text-base text-slate-600 sm:text-lg">
            Browse curated restaurants, lounges, and pop-ups, then book instantly via
            the Reserve booking widget. Geo search and filtering are coming soon.
          </p>
        </div>
        <SearchBar />
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">
              Featured venues
            </h2>
            <span className="text-sm font-medium text-slate-500">
              {venues.length} curated spots
            </span>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

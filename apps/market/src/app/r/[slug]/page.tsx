import { getVenueProfile } from '@/lib/api';
import { formatCuisines, formatPriceTier } from '@/lib/format';
import { BookButton } from '../../components/BookButton';

export const dynamic = 'force-dynamic';

interface VenuePageProps {
  params: { slug: string };
}

export default async function VenuePage({ params }: VenuePageProps) {
  const venue = await getVenueProfile(params.slug);

  const backgroundImage = venue.heroImageUrl
    ? `linear-gradient(180deg, rgba(15,23,42,0.6) 0%, rgba(15,23,42,0.9) 100%), url(${venue.heroImageUrl})`
    : 'linear-gradient(160deg, rgba(30,64,175,0.9) 0%, rgba(15,23,42,0.95) 100%)';

  return (
    <main className="flex-1 bg-white">
      <section
        className="relative flex min-h-[320px] items-end justify-start overflow-hidden"
        style={{ backgroundImage }}
      >
        <div className="absolute inset-0 bg-slate-950/30" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-16 text-white sm:gap-8 sm:py-24">
          <div className="flex flex-col gap-3">
            <p className="text-sm uppercase tracking-[0.25em] text-white/70">
              Reserve Market
            </p>
            <h1 className="text-3xl font-semibold sm:text-4xl">{venue.name}</h1>
            <p className="text-base text-white/80 sm:max-w-3xl">
              {venue.description ??
                'Live availability, chef highlights, and immersive media are on the way.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
            <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white">
              {formatPriceTier(venue.priceTier)}
            </span>
            <span>{formatCuisines(venue.cuisines)}</span>
            <span>|</span>
            <span>{venue.city}</span>
          </div>
          <BookButton
            venueId={venue.id}
            className="bg-white text-slate-900 hover:bg-slate-100 focus-visible:outline-white"
          >
            Book with Reserve
          </BookButton>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16 sm:flex-row">
        <div className="flex-1 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Details</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div>
                <dt className="font-medium text-slate-500">Location</dt>
                <dd>{venue.address ?? 'Listed soon'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Contact</dt>
                <dd>{venue.phone ?? 'Contact info coming soon'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Website</dt>
                <dd>
                  {venue.website ? (
                    <a
                      href={venue.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-900 underline underline-offset-4 hover:text-slate-700"
                    >
                      {venue.website}
                    </a>
                  ) : (
                    'Website link coming soon'
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <aside className="w-full max-w-md space-y-6 sm:w-80">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Highlights</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {(venue.highlights ?? [
                'We are gathering highlights in collaboration with the venue team.',
              ]).map((highlight, index) => (
                <li key={index} className="flex gap-3">
                  <span aria-hidden="true" className="text-slate-400">
                    *
                  </span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Ready to book?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Tap below to jump into the Reserve booking widget with this venue
              pre-selected.
            </p>
            <div className="mt-4">
              <BookButton
                venueId={venue.id}
                className="w-full justify-center"
              />
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getVenueProfile } from '@/lib/api';
import { formatCuisines, formatPriceTier } from '@/lib/format';
import { VenueReserveButton } from './VenueReserveButton';

export const revalidate = 60;

type VenuePageProps = {
  params: { slug: string };
};

export async function generateMetadata({
  params,
}: VenuePageProps): Promise<Metadata> {
  try {
    const venue = await getVenueProfile(params.slug);
    const title = `${venue.name} – Reserve Market`;
    const description =
      venue.description ??
      `Explore ${venue.name} on Reserve Market and book instantly with live availability.`;
    const images = venue.heroImageUrl ? [{ url: venue.heroImageUrl }] : [];
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: images.length ? images[0].url : undefined,
      },
    };
  } catch {
    return {
      title: 'Venue not found – Reserve Market',
      description: 'This venue could not be found on Reserve Market.',
    };
  }
}

export default async function VenuePage({ params }: VenuePageProps) {
  const venue = await getVenueProfile(params.slug).catch(() => null);
  if (!venue) {
    notFound();
  }
  const menu = venue.menuSummary ?? { sections: [] };
  const siteOrigin =
    process.env.MARKET_ORIGIN ??
    process.env.NEXT_PUBLIC_MARKET_ORIGIN ??
    'https://reserve.market';
  const jsonLd = buildJsonLd(venue, siteOrigin);

  return (
    <main className="flex-1 bg-white">
      <section className="relative h-[400px] w-full overflow-hidden bg-slate-200">
        {venue.heroImageUrl && (
          <img
            src={venue.heroImageUrl}
            alt={venue.name}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-8">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-4xl font-bold text-white sm:text-5xl">
              {venue.name}
            </h1>
            <p className="mt-2 text-lg text-white/90">
              {formatCuisines(venue.cuisines)} • {venue.city ?? 'Listed soon'}
            </p>
            {typeof venue.rating === 'number' && (
              <p className="mt-1 text-sm font-semibold text-white/80">
                ⭐ {venue.rating.toFixed(1)}{' '}
                <span className="text-white/60">
                  ({venue.reviewCount} reviews)
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-slate-900">
                About
              </h2>
              <p className="text-base leading-relaxed text-slate-700">
                {venue.description ??
                  'Live availability, chef highlights, and immersive media are on the way.'}
              </p>
            </div>

            {venue.highlights && venue.highlights.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-4 text-2xl font-semibold text-slate-900">
                  Highlights
                </h2>
                <ul className="space-y-2">
                  {venue.highlights.map((highlight, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-slate-700"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-slate-900">
                Cuisine
              </h2>
              <div className="flex flex-wrap gap-2">
                {venue.cuisines.map((cuisine) => (
                  <span
                    key={cuisine}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
                  >
                    {cuisine}
                  </span>
                ))}
              </div>
            </div>

            {menu.sections.length > 0 && (
              <div className="mb-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-slate-900">
                    Menu
                  </h2>
                  <span className="text-sm font-medium text-slate-500">
                    {menu.sections.length} section
                    {menu.sections.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-5">
                  {menu.sections.map((section) => (
                    <div
                      key={section.id ?? section.title}
                      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="border-b border-slate-100 px-5 py-4">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {section.title}
                        </h3>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {section.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between"
                          >
                            <div>
                              <p className="text-base font-medium text-slate-900">
                                {item.name}
                              </p>
                              {item.short && (
                                <p className="text-sm text-slate-600">
                                  {item.short}
                                </p>
                              )}
                              {item.tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                  {item.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-base font-semibold text-slate-900">
                                {formatPrice(item.price, item.currency)}
                              </p>
                              {!item.isAvailable && (
                                <p className="text-xs text-slate-500">
                                  Currently unavailable
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-6">
                <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  Price Tier
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatPriceTier(venue.priceTier)}
                </div>
              </div>

              {venue.address && (
                <div className="mb-6">
                  <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    Address
                  </div>
                  <p className="text-base text-slate-700">{venue.address}</p>
                </div>
              )}

              {venue.phone && (
                <div className="mb-6">
                  <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    Phone
                  </div>
                  <a
                    href={`tel:${venue.phone}`}
                    className="text-base text-blue-600 hover:underline"
                  >
                    {venue.phone}
                  </a>
                </div>
              )}

              {venue.website && (
                <div className="mb-6">
                  <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    Website
                  </div>
                  <a
                    href={venue.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base text-blue-600 hover:underline"
                  >
                    Visit site
                  </a>
                </div>
              )}

              <div className="mb-6 space-y-2 text-sm text-slate-600">
                {venue.parkingInfo && <p>Parking: {venue.parkingInfo}</p>}
                {venue.publicTransit && (
                  <p>Transit: {venue.publicTransit}</p>
                )}
                {venue.dressCode && <p>Dress code: {venue.dressCode}</p>}
              </div>

              <VenueReserveButton
                tenantId={venue.widget?.tenantId ?? venue.id}
                venueName={venue.name}
              />
            </div>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}

function formatPrice(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function buildJsonLd(venue: Awaited<ReturnType<typeof getVenueProfile>>, origin: string) {
  const address =
    venue.address ||
    venue.city ||
    venue.state ||
    venue.postalCode ||
    venue.country
      ? {
          '@type': 'PostalAddress',
          streetAddress: venue.address ?? undefined,
          addressLocality: venue.city ?? undefined,
          addressRegion: venue.state ?? undefined,
          postalCode: venue.postalCode ?? undefined,
          addressCountry: venue.country ?? undefined,
        }
      : undefined;

  const aggregateRating =
    typeof venue.rating === 'number'
      ? {
          '@type': 'AggregateRating',
          ratingValue: venue.rating,
          reviewCount: venue.reviewCount,
        }
      : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: venue.name,
    image: venue.heroImageUrl ? [venue.heroImageUrl] : undefined,
    url: `${origin}/venue/${venue.slug}`,
    telephone: venue.phone ?? undefined,
    address,
    servesCuisine: venue.cuisines,
    aggregateRating,
  };
}

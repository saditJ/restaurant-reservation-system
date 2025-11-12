import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  VenueSearchDto,
  VenueListResponseDto,
  VenueListItemDto,
} from './dto/venue-list.dto';
import {
  VenueDetailDto,
  MenuSummaryDto,
  ReviewDto,
} from './dto/venue-detail.dto';
import { SearchSuggestResponseDto } from './dto/search.dto';
import {
  VenueFacetsDto,
  VenueFacetResponseDto,
  VenueFacetBucket,
} from './dto/venue-facets.dto';
import { addDays, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { MenusService } from '../menus/menus.service';
import { CacheService } from '../cache/cache.service';

const VENUE_LIST_CACHE_TTL_SECONDS = 60;
const FACET_RESULT_LIMIT = 24;

type SortOption = 'rating' | 'price-asc' | 'price-desc' | 'name' | 'recent';

type NormalizedVenueFilters = {
  query?: string;
  city: string[];
  cuisine: string[];
  priceLevel: number[];
  tag?: string;
  sort: SortOption;
  page: number;
  pageSize: number;
  minRating?: number;
};

type NormalizeOptions = {
  skipPagination?: boolean;
};

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly cache: CacheService,
  ) {}

  async searchVenues(dto: VenueSearchDto): Promise<VenueListResponseDto> {
    const filters = this.normalizeFilters(dto);
    const cacheKey = this.buildSearchCacheKey(filters);
    const cached = await this.cache.get<VenueListResponseDto>(cacheKey);
    if (cached.status === 'hit' && cached.value) {
      return cached.value;
    }

    const skip = (filters.page - 1) * filters.pageSize;
    const where = this.buildWhere(filters);
    const orderBy = this.resolveOrderBy(filters.sort);

    const [venues, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip,
        take: filters.pageSize,
        orderBy,
        select: {
          id: true,
          slug: true,
          name: true,
          city: true,
          cuisines: true,
          heroImageUrl: true,
          priceLevel: true,
          tags: true,
          description: true,
          timezone: true,
          _count: {
            select: {
              reviews: {
                where: { isPublished: true },
              },
            },
          },
          reviews: {
            where: { isPublished: true },
            select: { rating: true },
          },
        },
      }),
      this.prisma.venue.count({ where }),
    ]);
    const venuesRaw = venues as any[];

    const items: VenueListItemDto[] = await Promise.all(
      venuesRaw.map(async (venue: any) => {
        const reviewCount = (venue._count && venue._count.reviews) || 0;
        const rating =
          reviewCount > 0 && Array.isArray(venue.reviews)
            ? (venue.reviews as any[]).reduce((sum, r) => sum + r.rating, 0) /
              reviewCount
            : null;

        let nextAvailable: string | null = null;
        try {
          const now = new Date();
          const shifts = await this.prisma.shift.findFirst({
            where: {
              venueId: venue.id,
              isActive: true,
            },
            orderBy: { startsAtLocal: 'asc' },
          });

          if (shifts) {
            const tomorrow = addDays(now, 1);
            nextAvailable = tomorrow.toISOString();
          }
        } catch {
          // Ignore errors for availability hints
        }

        return {
          id: venue.id,
          slug: venue.slug || venue.id,
          name: venue.name,
          city: venue.city,
          cuisines: venue.cuisines,
          heroImageUrl: venue.heroImageUrl,
          priceLevel: venue.priceLevel,
          rating: rating ? Math.round(rating * 10) / 10 : null,
          reviewCount,
          tags: venue.tags,
          shortDescription: venue.description
            ? `${venue.description.substring(0, 150)}${venue.description.length > 150 ? '…' : ''}`
            : null,
          nextAvailable,
        };
      }),
    );

    const filteredItems =
      typeof filters.minRating === 'number'
        ? items.filter(
            (item) => item.rating !== null && item.rating >= filters.minRating!,
          )
        : items;

    const response: VenueListResponseDto = {
      items: filteredItems,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.ceil(total / filters.pageSize),
    };

    await this.cache.set(cacheKey, response, {
      ttlSeconds: VENUE_LIST_CACHE_TTL_SECONDS,
    });

    return response;
  }

  async getVenueFacets(dto: VenueFacetsDto): Promise<VenueFacetResponseDto> {
    const filters = this.normalizeFilters(dto as Partial<VenueSearchDto>, {
      skipPagination: true,
    });
    const baseClauses = this.buildSqlClauses(filters);

    const cityRows = await this.prisma.$queryRaw<VenueFacetBucket[]>(
      Prisma.sql`
        SELECT "city" AS value, COUNT(*)::int AS count
        FROM "Venue"
        ${this.composeWhere([
          ...baseClauses,
          Prisma.sql`"city" IS NOT NULL AND "city" <> ''`,
        ])}
        GROUP BY "city"
        ORDER BY count DESC, value ASC
        LIMIT ${FACET_RESULT_LIMIT}
      `,
    );

    const cuisineRows = await this.prisma.$queryRaw<VenueFacetBucket[]>(
      Prisma.sql`
        WITH filtered AS (
          SELECT "cuisines"
          FROM "Venue"
          ${this.composeWhere(baseClauses)}
        )
        SELECT value, COUNT(*)::int AS count
        FROM (
          SELECT unnest("cuisines") AS value
          FROM filtered
        ) expanded
        WHERE value IS NOT NULL AND value <> ''
        GROUP BY value
        ORDER BY count DESC, value ASC
        LIMIT ${FACET_RESULT_LIMIT}
      `,
    );

    const priceRows = await this.prisma.$queryRaw<
      Array<{ value: number; count: number }>
    >(
      Prisma.sql`
        SELECT "priceLevel" AS value, COUNT(*)::int AS count
        FROM "Venue"
        ${this.composeWhere([
          ...baseClauses,
          Prisma.sql`"priceLevel" IS NOT NULL`,
        ])}
        GROUP BY "priceLevel"
        ORDER BY value ASC
      `,
    );

    return {
      city: cityRows
        .map((row) => ({
          value: row.value?.trim() ?? '',
          count: Number(row.count) || 0,
        }))
        .filter((bucket) => bucket.value.length > 0),
      cuisine: cuisineRows
        .map((row) => ({
          value: row.value?.trim() ?? '',
          count: Number(row.count) || 0,
        }))
        .filter((bucket) => bucket.value.length > 0),
      priceLevel: priceRows.map((row) => ({
        value: Number(row.value),
        count: Number(row.count) || 0,
      })),
    };
  }

  async getVenueBySlug(slug: string): Promise<VenueDetailDto> {
    // Build untyped where clause because `slug` may be optional in generated types
    const whereClause: any = { OR: [{ slug }, { id: slug }], isPublic: true };
    const venue = (await this.prisma.venue.findFirst({
      where: whereClause,
      include: {
        tenant: {
          select: { id: true },
        },
        reviews: {
          where: { isPublished: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            guestName: true,
            rating: true,
            title: true,
            comment: true,
            createdAt: true,
            response: true,
            respondedAt: true,
          },
        },
      },
    })) as any;

    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    // Track analytics (increment view count)
    await this.trackView(venue.id);

    // Calculate average rating
    const reviewCount = Array.isArray(venue.reviews) ? venue.reviews.length : 0;
    const rating =
      reviewCount > 0 && Array.isArray(venue.reviews)
        ? (venue.reviews as any[]).reduce((sum, r) => sum + r.rating, 0) /
          reviewCount
        : null;

    const menuSummary: MenuSummaryDto = await this.menus.getPublicMenu(
      venue.id,
    );

    // Get next available slots (simplified)
    const nextAvailableSlots = await this.getNextAvailableSlots(
      venue.id,
      venue.timezone,
    );

    // Build reviews
    const reviews: ReviewDto[] = (venue.reviews || []).map((review: any) => ({
      id: review.id,
      guestName: review.guestName,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      response: review.response,
      respondedAt: review.respondedAt?.toISOString() || null,
    }));

    return {
      id: venue.id,
      slug: venue.slug || venue.id,
      name: venue.name,
      address: venue.address,
      city: venue.city,
      state: venue.state,
      country: venue.country,
      postalCode: venue.postalCode,
      timezone: venue.timezone,
      cuisines: venue.cuisines,
      phone: venue.phone,
      email: venue.email,
      website: venue.website,
      heroImageUrl: venue.heroImageUrl,
      gallery: venue.gallery,
      priceLevel: venue.priceLevel,
      rating: rating ? Math.round(rating * 10) / 10 : null,
      reviewCount,
      tags: venue.tags,
      description: venue.description,
      hours: venue.hours,
      amenities: venue.amenities,
      dressCode: venue.dressCode,
      parkingInfo: venue.parkingInfo,
      publicTransit: venue.publicTransit,
      menuSummary,
      widget: {
        tenantId: venue.tenant?.id,
        bookingUrl: `/reserve?venueId=${venue.id}`,
      },
      reviews,
      nextAvailableSlots,
    };
  }

  async searchSuggestions(
    query: string,
    limit: number = 10,
  ): Promise<SearchSuggestResponseDto> {
    if (query.length < 2) {
      return { suggestions: [] };
    }

    const [venues, cuisines, tags] = await Promise.all([
      // Venue names
      this.prisma.venue.findMany({
        where: {
          isPublic: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { name: true },
        take: limit,
      }),
      // Cuisines (distinct values from array field)
      this.prisma.$queryRaw<Array<{ cuisine: string }>>`
        SELECT DISTINCT unnest(cuisines) as cuisine
        FROM "Venue"
        WHERE "isPublic" = true
          AND EXISTS (
            SELECT 1 FROM unnest(cuisines) AS c
            WHERE c ILIKE ${`%${query}%`}
          )
        LIMIT ${limit}
      `,
      // Tags (distinct values from array field)
      this.prisma.$queryRaw<Array<{ tag: string }>>`
        SELECT DISTINCT unnest(tags) as tag
        FROM "Venue"
        WHERE "isPublic" = true
          AND EXISTS (
            SELECT 1 FROM unnest(tags) AS t
            WHERE t ILIKE ${`%${query}%`}
          )
        LIMIT ${limit}
      `,
    ]);

    const suggestions = [
      ...venues.map((v) => v.name),
      ...cuisines.map((c) => c.cuisine),
      ...tags.map((t) => t.tag),
    ];

    // Remove duplicates and limit
    const uniqueSuggestions = Array.from(new Set(suggestions)).slice(0, limit);

    return { suggestions: uniqueSuggestions };
  }

  private buildWhere(filters: NormalizedVenueFilters): Prisma.VenueWhereInput {
    const where: Prisma.VenueWhereInput = { isPublic: true };
    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: 'insensitive' } },
        { cuisines: { has: filters.query } },
        { tags: { has: filters.query } },
        { description: { contains: filters.query, mode: 'insensitive' } },
      ];
    }

    const andFilters: Prisma.VenueWhereInput[] = [];
    if (filters.city.length) {
      andFilters.push({
        OR: filters.city.map((value) => ({
          city: { equals: value, mode: 'insensitive' },
        })),
      });
    }
    if (filters.cuisine.length) {
      andFilters.push({
        OR: filters.cuisine.map((value) => ({
          cuisines: { has: value },
        })),
      });
    }
    if (filters.priceLevel.length) {
      andFilters.push({
        priceLevel: { in: filters.priceLevel },
      });
    }
    if (filters.tag) {
      andFilters.push({ tags: { has: filters.tag } });
    }
    if (andFilters.length > 0) {
      where.AND = andFilters;
    }
    return where;
  }

  private resolveOrderBy(
    sort: SortOption,
  ): Prisma.VenueOrderByWithRelationInput[] {
    switch (sort) {
      case 'price-asc':
        return [{ priceLevel: 'asc' }, { name: 'asc' }];
      case 'price-desc':
        return [{ priceLevel: 'desc' }, { name: 'asc' }];
      case 'name':
        return [{ name: 'asc' }];
      case 'recent':
        return [{ createdAt: 'desc' }];
      case 'rating':
      default:
        return [
        {
          reviews: {
            _count: 'desc',
          },
        },
          { createdAt: 'desc' },
        ];
    }
  }

  private normalizeFilters(
    dto: Partial<VenueSearchDto>,
    options: NormalizeOptions = {},
  ): NormalizedVenueFilters {
    const pageInput = Number(dto.page);
    const sizeInput = Number(dto.pageSize);
    const page = options.skipPagination
      ? 1
      : Number.isFinite(pageInput) && pageInput > 0
        ? Math.floor(pageInput)
        : 1;
    const pageSize = options.skipPagination
      ? 24
      : Number.isFinite(sizeInput) && sizeInput > 0
        ? Math.min(Math.floor(sizeInput), 100)
        : 24;

    const query = dto.query?.trim();
    const tag = dto.tag?.trim();
    const minRating =
      typeof dto.minRating === 'number' && Number.isFinite(dto.minRating)
        ? Math.max(1, Math.min(5, dto.minRating))
        : undefined;

    return {
      query: query || undefined,
      city: this.normalizeStringArray(dto.city),
      cuisine: this.normalizeStringArray(dto.cuisine),
      priceLevel: this.normalizeNumberArray(dto.priceLevel),
      tag: tag || undefined,
      sort: options.skipPagination
        ? 'rating'
        : this.normalizeSort(dto.sort ?? dto.sortBy),
      page,
      pageSize,
      minRating,
    };
  }

  private normalizeStringArray(values?: string[] | string | null): string[] {
    if (!values) return [];
    const arr = Array.isArray(values) ? values : [values];
    const normalized = arr
      .map((value) => (value ?? '').toString().trim())
      .filter((value) => value.length > 0);
    const map = new Map<string, string>();
    for (const value of normalized) {
      const key = value.toLowerCase();
      if (!map.has(key)) {
        map.set(key, value);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }

  private normalizeNumberArray(values?: number[] | number | null): number[] {
    if (values === undefined || values === null) return [];
    const arr = Array.isArray(values) ? values : [values];
    const normalized = arr
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(1, Math.min(4, Math.floor(value))));
    return Array.from(new Set(normalized)).sort((a, b) => a - b);
  }

  private normalizeSort(value?: string): SortOption {
    if (!value) return 'rating';
    const normalized = value.toLowerCase();
    if (normalized === 'price' || normalized === 'priceasc') return 'price-asc';
    if (normalized === 'pricedesc' || normalized === 'price-desc')
      return 'price-desc';
    if (normalized === 'name') return 'name';
    if (normalized === 'recent') return 'recent';
    if (normalized === 'rating' || normalized === 'popular') return 'rating';
    return 'rating';
  }

  private buildSearchCacheKey(filters: NormalizedVenueFilters): string {
    const payload = JSON.stringify({
      q: filters.query ?? null,
      city: filters.city,
      cuisine: filters.cuisine,
      price: filters.priceLevel,
      tag: filters.tag ?? null,
      sort: filters.sort,
      page: filters.page,
      size: filters.pageSize,
      minRating: filters.minRating ?? null,
    });
    return `market:venues:${createHash('sha1').update(payload).digest('hex')}`;
  }

  private buildSqlClauses(filters: NormalizedVenueFilters): Prisma.Sql[] {
    const clauses: Prisma.Sql[] = [Prisma.sql`"isPublic" = true`];

    if (filters.query) {
      const like = `%${filters.query}%`;
      clauses.push(
        Prisma.sql`(
          "name" ILIKE ${like}
          OR "description" ILIKE ${like}
          OR "city" ILIKE ${like}
          OR EXISTS (
            SELECT 1 FROM unnest("cuisines") AS c WHERE c ILIKE ${like}
          )
        )`,
      );
    }

    if (filters.city.length) {
      const cityClauses = filters.city.map(
        (value) => Prisma.sql`"city" ILIKE ${value}`,
      );
      clauses.push(
        cityClauses.length === 1
          ? cityClauses[0]
          : Prisma.sql`(${Prisma.join(cityClauses, ' OR ')})`,
      );
    }

    if (filters.cuisine.length) {
      const cuisineClauses = filters.cuisine.map(
        (value) =>
          Prisma.sql`EXISTS (
            SELECT 1 FROM unnest("cuisines") AS c WHERE c ILIKE ${value}
          )`,
      );
      clauses.push(
        cuisineClauses.length === 1
          ? cuisineClauses[0]
          : Prisma.sql`(${Prisma.join(cuisineClauses, ' OR ')})`,
      );
    }

    if (filters.priceLevel.length) {
      const priceValues = Prisma.join(
        filters.priceLevel.map((value) => Prisma.sql`${value}`),
        ',',
      );
      clauses.push(
        Prisma.sql`"priceLevel" = ANY(ARRAY[${priceValues}]::int[])`,
      );
    }

    if (filters.tag) {
      clauses.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM unnest("tags") AS t WHERE t ILIKE ${filters.tag}
        )`,
      );
    }

    return clauses;
  }

  private composeWhere(clauses: Prisma.Sql[]): Prisma.Sql {
    if (!clauses.length) {
      return Prisma.sql``;
    }
    const joined = Prisma.join(clauses, ' AND ');
    return Prisma.sql`WHERE ${joined}`;
  }

  private async trackView(venueId: string): Promise<void> {
    const today = startOfDay(new Date());

    // use any for analytics model access to avoid generated-client type mismatches
    await (this.prisma as any).venueAnalytics.upsert({
      where: {
        venueId_date: {
          venueId,
          date: today,
        },
      },
      create: {
        venueId,
        date: today,
        views: 1,
      },
      update: {
        views: { increment: 1 },
      },
    });
  }

  private async getNextAvailableSlots(
    venueId: string,
    timezone: string,
  ): Promise<string[]> {
    try {
      const now = new Date();
      const nowInVenueTz = toZonedTime(now, timezone);
      const today = startOfDay(nowInVenueTz);

      // Get active shifts for next 7 days
      const shifts = await this.prisma.shift.findMany({
        where: {
          venueId,
          isActive: true,
        },
        orderBy: { dow: 'asc' },
      });

      if (shifts.length === 0) {
        return [];
      }

      // Simple heuristic: return tomorrow's first shift time
      const tomorrow = addDays(today, 1);
      const firstShift = shifts[0];

      // Convert shift start time to full datetime
      const shiftTime = new Date(firstShift.startsAtLocal);
      const slot = new Date(tomorrow);
      slot.setHours(shiftTime.getHours(), shiftTime.getMinutes(), 0, 0);

      return [slot.toISOString()];
    } catch (err) {
      return [];
    }
  }
}

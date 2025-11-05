import { Injectable, NotFoundException } from '@nestjs/common';
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
import { addDays, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  async searchVenues(dto: VenueSearchDto): Promise<VenueListResponseDto> {
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 24;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {
      isPublic: true,
    };

    if (dto.query) {
      where.OR = [
        { name: { contains: dto.query, mode: 'insensitive' } },
        { cuisines: { has: dto.query } },
        { tags: { has: dto.query } },
        { description: { contains: dto.query, mode: 'insensitive' } },
      ];
    }

    if (dto.city) {
      where.city = { equals: dto.city, mode: 'insensitive' };
    }

    if (dto.cuisine) {
      where.cuisines = { has: dto.cuisine };
    }

    if (dto.priceLevel) {
      where.priceLevel = dto.priceLevel;
    }

    if (dto.tag) {
      where.tags = { has: dto.tag };
    }

    // Build orderBy
    let orderBy: any = {};
    if (dto.sortBy === 'priceAsc') {
      orderBy = { priceLevel: 'asc' };
    } else if (dto.sortBy === 'priceDesc') {
      orderBy = { priceLevel: 'desc' };
    } else {
      orderBy = { createdAt: 'desc' }; // default
    }

    // Execute query with aggregations
    // Use untyped results to avoid strict generated Prisma types for dynamic selects
    const results = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip,
        take: pageSize,
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
    const venues = results[0] as any[];
    const total = results[1] as number;

    // Calculate ratings and get next available slots
    const items: VenueListItemDto[] = await Promise.all(
      venues.map(async (venue: any) => {
        const reviewCount = (venue._count && (venue._count as any).reviews) || 0;
        const rating =
          reviewCount > 0 && Array.isArray(venue.reviews)
            ? (venue.reviews as any[]).reduce((sum, r) => sum + r.rating, 0) / reviewCount
            : null;

        // Get next available slot (simplified - just check if there's a shift today/tomorrow)
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
            // Simple heuristic: if venue has shifts, show tomorrow at shift start
            const tomorrow = addDays(now, 1);
            nextAvailable = tomorrow.toISOString();
          }
        } catch (err) {
          // Ignore errors for next available
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
            ? venue.description.substring(0, 150) + '...'
            : null,
          nextAvailable,
        };
      }),
    );

    // Apply rating filter after aggregation
    let filteredItems = items;
    if (dto.minRating) {
      filteredItems = items.filter(
        (item) => item.rating !== null && item.rating >= dto.minRating!,
      );
    }

    // Apply sorting for popular/rating
    if (dto.sortBy === 'popular') {
      filteredItems.sort((a, b) => b.reviewCount - a.reviewCount);
    } else if (dto.sortBy === 'rating') {
      filteredItems.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return {
      items: filteredItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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
        menus: {
          where: { isActive: true },
          include: {
            sections: {
              include: {
                items: {
                  where: { isAvailable: true },
                  take: 6,
                  orderBy: { displayOrder: 'asc' },
                },
              },
              orderBy: { displayOrder: 'asc' },
              take: 3,
            },
          },
          orderBy: { displayOrder: 'asc' },
          take: 1,
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
        ? (venue.reviews as any[]).reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : null;

    // Build menu summary
    const menuSummary: MenuSummaryDto = {
      sections:
        (venue.menus && venue.menus[0]?.sections?.map((section: any) => ({
          title: section.title,
          items: section.items.map((item: any) => ({
            id: item.id,
            name: item.name,
            price: parseFloat(item.price.toString()),
            currency: item.currency,
            description: item.description,
          })),
        })) as any) || [],
    };

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

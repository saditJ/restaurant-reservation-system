import { Controller, Get, Query, Req, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'crypto';
import { AvailabilityService } from './availability.service';
import { CacheService } from './cache/cache.service';
import { CacheMetricsInterceptor } from './cache/cache.metrics.interceptor';
import { DEFAULT_VENUE_ID } from './utils/default-venue';

@Controller('v1/availability')
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly cache: CacheService,
  ) {}

  private buildPolicyHash(input: {
    time?: string;
    area?: string;
    tableId?: string;
  }) {
    const payload = JSON.stringify({
      v: 1,
      time: (input.time ?? '').trim(),
      area: (input.area ?? '').trim(),
      tableId: (input.tableId ?? '').trim(),
    });
    return createHash('sha1').update(payload).digest('hex').slice(0, 16);
  }

  @UseInterceptors(CacheMetricsInterceptor)
  @Get()
  async getAvailability(
    @Query('venueId') venueId?: string,
    @Query('date') date?: string,
    @Query('time') time?: string,
    @Query('partySize') partySize?: string,
    @Query('party') legacyParty?: string,
    @Query('area') area?: string,
    @Query('tableId') tableId?: string,
    @Req() req?: Request & { cacheStatus?: 'hit' | 'miss' },
  ) {
    const resolvedParty =
      partySize?.trim() || legacyParty?.trim() || '2';
    const normalizedVenueId = venueId?.trim() || DEFAULT_VENUE_ID;
    const normalizedDate = (date ?? '').trim();
    const partySizeNumber = Number(resolvedParty);
    const policyHash = this.buildPolicyHash({
      time,
      area,
      tableId,
    });
    const cacheKey = this.cache.buildAvailabilityKey(
      normalizedVenueId,
      normalizedDate,
      partySizeNumber,
      policyHash,
    );

    const cacheResult =
      await this.cache.get<
        Awaited<ReturnType<AvailabilityService['getAvailability']>>
      >(cacheKey);
    if (cacheResult.status === 'hit' && cacheResult.value) {
      if (req) req.cacheStatus = 'hit';
      return cacheResult.value;
    }

    const availability = await this.availability.getAvailability({
      venueId: venueId || undefined,
      date: date || '',
      time: time || '',
      partySize: Number(resolvedParty),
      area: area || undefined,
      tableId: tableId || undefined,
    });

    if (cacheResult.status === 'miss') {
      const ttlSeconds = 30 + Math.floor(Math.random() * 31);
      void this.cache.set(cacheKey, availability, { ttlSeconds });
      if (req) req.cacheStatus = 'miss';
    } else if (cacheResult.status === 'skipped') {
      const ttlSeconds = 30 + Math.floor(Math.random() * 31);
      void this.cache.set(cacheKey, availability, { ttlSeconds });
    }

    return availability;
  }
}

import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { AvailabilityService } from './availability.service';
import { CacheService } from './cache/cache.service';
import { CacheMetricsInterceptor } from './cache/cache.metrics.interceptor';
import { AvailabilityPolicyService } from './availability/policy.service';
import { DEFAULT_VENUE_ID } from './utils/default-venue';
import { assertValidDate } from './utils/time';

@Controller('v1/availability')
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly cache: CacheService,
    private readonly policy: AvailabilityPolicyService,
  ) {}

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

    if (!normalizedDate) {
      throw new BadRequestException('date is required');
    }
    try {
      assertValidDate(normalizedDate);
    } catch (error) {
      throw new BadRequestException(
        'Invalid date format, expected YYYY-MM-DD',
      );
    }

    const policyEvaluation = await this.policy.evaluateDay({
      venueId: normalizedVenueId,
      date: normalizedDate,
    });

    const cacheKey = this.cache.buildAvailabilityKey(
      normalizedVenueId,
      normalizedDate,
      partySizeNumber,
      policyEvaluation.policyHash,
    );

    const cacheResult =
      await this.cache.get<
        Awaited<ReturnType<AvailabilityService['getAvailability']>>
      >(cacheKey);
    if (cacheResult.status === 'hit' && cacheResult.value) {
      if (req) req.cacheStatus = 'hit';
      return cacheResult.value;
    }

    const availability = await this.availability.getAvailability(
      {
        venueId: venueId || undefined,
        date: date || '',
        time: time || '',
        partySize: Number(resolvedParty),
        area: area || undefined,
        tableId: tableId || undefined,
      },
      { policy: policyEvaluation },
    );

    const ttlSeconds = 45;
    if (cacheResult.status === 'miss') {
      void this.cache.set(cacheKey, availability, { ttlSeconds });
      if (req) req.cacheStatus = 'miss';
    } else if (cacheResult.status === 'skipped') {
      void this.cache.set(cacheKey, availability, { ttlSeconds });
    }

    return availability;
  }

  /**
   * Get availability slots using the DST-safe engine.
   * Returns time slots with capacity information across a date range.
   */
  @Get('slots')
  async getAvailabilitySlots(
    @Query('venueId') venueId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('partySize') partySize?: string,
    @Query('area') area?: string,
  ) {
    const normalizedVenueId = venueId?.trim() || DEFAULT_VENUE_ID;
    const normalizedStartDate = (startDate ?? '').trim();
    const normalizedEndDate = endDate?.trim();
    const partySizeNumber = Number(partySize || '2');

    if (!normalizedStartDate) {
      throw new BadRequestException('startDate is required');
    }
    try {
      assertValidDate(normalizedStartDate);
      if (normalizedEndDate) assertValidDate(normalizedEndDate);
    } catch (error) {
      throw new BadRequestException(
        'Invalid date format, expected YYYY-MM-DD',
      );
    }

    return this.availability.getAvailabilitySlots({
      venueId: normalizedVenueId,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      partySize: partySizeNumber,
      area: area?.trim(),
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Venue } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { DEFAULT_VENUE_ID, ensureDefaultVenue } from '../utils/default-venue';
import { normalizeTimeTo24h } from '../utils/time';
import { UpdateVenueSettingsDto } from './dto/update-venue-settings.dto';
import { UpdateVenuePoliciesDto } from './dto/update-venue-policies.dto';

type HourRange = { start: string; end: string };
export type VenueHours = Record<string, HourRange[]>;

export type VenueSettingsResponse = {
  venueId: string;
  timezone: string;
  hours: VenueHours | null;
  turnTimeMin: number;
  holdTtlMin: number;
  defaultDurationMin: number;
};

export type VenuePoliciesResponse = {
  venueId: string;
  cancellationWindowMin: number;
  guestCanModifyUntilMin: number;
  noShowFeePolicy: boolean;
  retainPersonalDataDays: number;
};

@Injectable()
export class VenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async getSettings(venueId: string): Promise<VenueSettingsResponse> {
    const venue = await this.findVenue(venueId);
    return {
      venueId: venue.id,
      timezone: venue.timezone,
      hours: this.parseHours(venue.hours),
      turnTimeMin: venue.turnTimeMin,
      holdTtlMin: venue.holdTtlMin,
      defaultDurationMin: venue.defaultDurationMin,
    };
  }

  async updateSettings(
    venueId: string,
    dto: UpdateVenueSettingsDto,
  ): Promise<VenueSettingsResponse> {
    const venue = await this.findVenue(venueId);
    const hours = this.normalizeHours(dto.hours);
    const data: Prisma.VenueUpdateInput = {
      timezone: dto.timezone.trim(),
      turnTimeMin: this.normalizeMinutes(dto.turnTimeMin, 0),
      holdTtlMin: this.normalizeMinutes(dto.holdTtlMin, 1),
      defaultDurationMin: this.normalizeMinutes(dto.defaultDurationMin, 15),
    };
    if (hours !== undefined) {
      data.hours = hours === null ? Prisma.JsonNull : hours;
    }
    await this.prisma.venue.update({
      where: { id: venue.id },
      data,
    });
    return this.getSettings(venue.id);
  }

  async getPolicies(venueId: string): Promise<VenuePoliciesResponse> {
    const venue = await this.findVenue(venueId);
    return this.toPoliciesResponse(venue);
  }

  async updatePolicies(
    venueId: string,
    dto: UpdateVenuePoliciesDto,
    actor = 'system',
  ): Promise<VenuePoliciesResponse> {
    const venue = await this.findVenue(venueId);
    const cancellationWindow = this.normalizeMinutes(
      dto.cancellationWindowMin,
      0,
    );
    const guestModify = this.normalizeMinutes(dto.guestCanModifyUntilMin, 0);
    const retentionDays = this.normalizeMinutes(dto.retainPersonalDataDays, 30);
    const before = this.toPoliciesResponse(venue);
    const updated = await this.prisma.venue.update({
      where: { id: venue.id },
      data: {
        cancellationWindowMin: cancellationWindow,
        guestCanModifyUntilMin: Math.min(guestModify, cancellationWindow),
        noShowFeePolicy: dto.noShowFeePolicy,
        retainPersonalDataDays: retentionDays,
      },
    });
    const after = this.toPoliciesResponse(updated);
    await this.audit.record({
      actor,
      action: 'venue.policies.update',
      resource: `venue:${venue.id}`,
      before,
      after,
    });
    return after;
  }

  private async findVenue(venueId: string): Promise<Venue> {
    const id = venueId.trim();
    if (id === DEFAULT_VENUE_ID) {
      return ensureDefaultVenue(this.prisma);
    }
    const venue = await this.prisma.venue.findUnique({
      where: { id },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} not found`);
    }
    return venue;
  }

  private normalizeMinutes(value: number, min: number) {
    const numeric = Math.floor(Number(value));
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException('Invalid numeric value');
    }
    if (numeric < min) {
      throw new BadRequestException(
        `Value must be greater than or equal to ${min}`,
      );
    }
    return numeric;
  }

  private normalizeHours(
    hours: Record<string, unknown> | null | undefined,
  ): VenueHours | null | undefined {
    if (hours === undefined) return undefined;
    if (hours === null) return null;
    if (typeof hours !== 'object' || Array.isArray(hours)) {
      throw new BadRequestException('hours must be an object');
    }
    const result: VenueHours = {};
    for (const [rawDay, rawSlots] of Object.entries(hours)) {
      if (!Array.isArray(rawSlots)) {
        throw new BadRequestException(`hours.${rawDay} must be an array`);
      }
      const day = rawDay.trim().toLowerCase();
      if (!day) {
        throw new BadRequestException('hours keys must be non-empty strings');
      }
      result[day] = rawSlots.map((slot, index) => {
        if (typeof slot !== 'object' || slot === null) {
          throw new BadRequestException(
            `hours.${day}[${index}] must be an object`,
          );
        }
        const { start, end } = slot as { start?: unknown; end?: unknown };
        const normalizedStartRaw = normalizeTimeTo24h(String(start ?? ''));
        const normalizedEndRaw = normalizeTimeTo24h(String(end ?? ''));
        if (
          !normalizedStartRaw ||
          !normalizedEndRaw ||
          !/^\d{2}:\d{2}$/.test(normalizedStartRaw) ||
          !/^\d{2}:\d{2}$/.test(normalizedEndRaw)
        ) {
          throw new BadRequestException(
            `hours.${day}[${index}] start/end must be HH:MM in 24h format`,
          );
        }
        const normalizedStart = normalizedStartRaw;
        const normalizedEnd = normalizedEndRaw;
        if (normalizedStart === normalizedEnd) {
          throw new BadRequestException(
            `hours.${day}[${index}] start and end cannot be equal`,
          );
        }
        return { start: normalizedStart, end: normalizedEnd };
      });
    }
    return result;
  }

  private parseHours(value: Prisma.JsonValue | null): VenueHours | null {
    if (
      value === null ||
      (value as unknown) === Prisma.JsonNull ||
      typeof value !== 'object'
    ) {
      return null;
    }
    return this.normalizeHours(value as Record<string, unknown>) ?? null;
  }

  private toPoliciesResponse(venue: Venue): VenuePoliciesResponse {
    return {
      venueId: venue.id,
      cancellationWindowMin: venue.cancellationWindowMin,
      guestCanModifyUntilMin: venue.guestCanModifyUntilMin,
      noShowFeePolicy: venue.noShowFeePolicy,
      retainPersonalDataDays: venue.retainPersonalDataDays,
    };
  }
}

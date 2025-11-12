import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Hold, HoldStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { HoldsService } from '../holds.service';
import { AvailabilityPolicyService } from '../availability/policy.service';
import { AvailabilityService } from '../availability.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { ListWaitlistQueryDto } from './dto/list-waitlist-query.dto';
import { OfferWaitlistDto } from './dto/offer-waitlist.dto';
import { WaitlistStatus } from './waitlist.types';
import { encryptPii, decryptPii } from '../privacy/pii-crypto';
import { DEFAULT_VENUE_ID, ensureDefaultVenue } from '../utils/default-venue';
import { randomBytes } from 'crypto';

const OFFER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_TTL_MINUTES = 15;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 180;

export type WaitlistAdminDto = {
  id: string;
  venueId: string;
  venueName: string;
  venueTimezone: string;
  name: string;
  email: string | null;
  phone: string | null;
  partySize: number;
  desiredAt: string;
  notes: string | null;
  priority: number;
  status: WaitlistStatus;
  offerCode: string | null;
  offerToken: string | null;
  holdId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  hold: null | {
    id: string;
    status: HoldStatus;
    slotLocalDate: string;
    slotLocalTime: string;
    slotStartUtc: string;
    expiresAt: string;
  };
};

export type WaitlistOfferSummary = {
  id: string;
  waitlistId: string;
  holdId: string | null;
  offerCode: string | null;
  guestName: string;
  guestEmail: string | null;
  venueId: string | null;
  venueName: string | null;
  status: WaitlistStatus | null;
  sentAt: string;
  expiresAt: string | null;
};

type WaitlistWithRelations = Prisma.WaitlistGetPayload<{
  include: {
    venue: true;
    hold: true;
  };
}>;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);
  private readonly availability: AvailabilityService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly holds: HoldsService,
    private readonly policy: AvailabilityPolicyService,
  ) {
    this.availability = new AvailabilityService(prisma, policy);
  }

  private get waitlistInclude() {
    return { venue: true, hold: true } satisfies Prisma.WaitlistInclude;
  }

  async create(dto: CreateWaitlistDto): Promise<WaitlistAdminDto> {
    const venue = await this.resolveVenue(dto.venueId);
    const desiredAt = this.parseDesiredAt(dto.desiredAt);
    const partySize = this.normalizePartySize(dto.partySize);
    const priority = this.normalizePriority(dto.priority);
    const email = encryptPii(dto.email);
    const phoneEnc =
      dto.phone && dto.phone.trim().length > 0 ? encryptPii(dto.phone) : null;

    const created = await this.prisma.waitlist.create({
      data: {
        venueId: venue.id,
        name: dto.name.trim(),
        emailEnc: email.ciphertext,
        phoneEnc: phoneEnc?.ciphertext ?? null,
        partySize,
        desiredAt,
        notes: dto.notes?.trim() || null,
        priority,
        status: 'WAITING',
      },
      include: this.waitlistInclude,
    });
    return this.toAdminDto(created);
  }

  async list(
    query: ListWaitlistQueryDto,
  ): Promise<{ items: WaitlistAdminDto[]; total: number }> {
    const where: Prisma.WaitlistWhereInput = {};
    if (query.venueId?.trim()) {
      where.venueId = query.venueId.trim();
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.desiredFrom || query.desiredTo) {
      where.desiredAt = {};
      if (query.desiredFrom) {
        (where.desiredAt as Prisma.DateTimeFilter).gte = new Date(
          query.desiredFrom,
        );
      }
      if (query.desiredTo) {
        (where.desiredAt as Prisma.DateTimeFilter).lte = new Date(
          query.desiredTo,
        );
      }
    }

    const limit = this.normalizeLimit(query.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.waitlist.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { desiredAt: 'asc' },
          { createdAt: 'asc' },
        ],
        take: limit,
        include: this.waitlistInclude,
      }),
      this.prisma.waitlist.count({ where }),
    ]);

    return {
      items: items.map((entry) => this.toAdminDto(entry)),
      total,
    };
  }

  async offer(
    id: string,
    dto: OfferWaitlistDto,
  ): Promise<{ waitlist: WaitlistAdminDto; hold: Hold }> {
    const entry = await this.prisma.waitlist.findUnique({
      where: { id },
      include: this.waitlistInclude,
    });
    if (!entry) {
      throw new NotFoundException('Waitlist entry not found');
    }
    if (entry.status !== 'WAITING') {
      throw new ConflictException('Only waiting entries can be offered');
    }

    const slotStart = this.parseSlotStart(dto.slotStart);
    const ttlMinutes = this.normalizeTtl(dto.ttlMinutes);
    const { date, time } = this.toLocalSlot(slotStart, entry.venue.timezone);

    const tableId = await this.pickTable(
      entry.venueId,
      date,
      time,
      entry.partySize,
    );
    if (!tableId) {
      throw new ConflictException('No tables available for the requested slot');
    }

    const hold = await this.holds.create({
      venueId: entry.venueId,
      date,
      time,
      partySize: entry.partySize,
      tableId,
      ttlSec: ttlMinutes * 60,
      createdBy: 'waitlist-offer',
    });

    const { waitlist: offered } = await this.assignOffer(entry.id, hold);
    return { waitlist: this.toAdminDto(offered), hold };
  }

  async expire(id: string): Promise<WaitlistAdminDto> {
    const entry = await this.prisma.waitlist.findUnique({
      where: { id },
      include: this.waitlistInclude,
    });
    if (!entry) {
      throw new NotFoundException('Waitlist entry not found');
    }
    if (entry.holdId && entry.hold?.status === HoldStatus.HELD) {
      await this.safeCancelHold(entry.holdId);
    }

    const updated = await this.prisma.waitlist.update({
      where: { id },
      data: {
        status: 'EXPIRED',
        offerCode: null,
        offerToken: null,
        holdId: null,
        expiresAt: null,
      },
      include: this.waitlistInclude,
    });
    return this.toAdminDto(updated);
  }

  async convert(id: string): Promise<WaitlistAdminDto> {
    const updated = await this.prisma.waitlist.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        offerToken: null,
        expiresAt: null,
      },
      include: this.waitlistInclude,
    });
    return this.toAdminDto(updated);
  }

  async resolveOfferCode(
    code: string,
    token?: string | null,
  ): Promise<{
    waitlistId: string;
    holdId: string;
    venueId: string;
    partySize: number;
    startAt: string;
    slotLocalDate: string;
    slotLocalTime: string;
    expiresAt: string;
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
  }> {
    const normalized = code.trim();
    if (!normalized) {
      throw new NotFoundException('Offer not found');
    }

    const entry = await this.prisma.waitlist.findFirst({
      where: { offerCode: normalized },
      include: this.waitlistInclude,
    });
    if (!entry) {
      throw new NotFoundException('Offer not found');
    }
    const normalizedToken = token?.trim() ?? '';
    if (!normalizedToken || entry.offerToken !== normalizedToken) {
      throw new NotFoundException('Offer not found');
    }
    if (!entry.holdId || !entry.hold) {
      throw new GoneException('Offer has no active hold');
    }

    const hold = entry.hold;
    const now = new Date();
    if (
      entry.status !== 'OFFERED' ||
      !entry.expiresAt ||
      entry.expiresAt.getTime() <= now.getTime() ||
      hold.status !== HoldStatus.HELD ||
      hold.expiresAt.getTime() <= now.getTime()
    ) {
      await this.safeCancelHold(hold.id);
      await this.forceExpire(entry.id);
      throw new GoneException('Offer expired');
    }

    return {
      waitlistId: entry.id,
      holdId: hold.id,
      venueId: entry.venueId,
      partySize: entry.partySize,
      startAt: hold.slotStartUtc.toISOString(),
      slotLocalDate: hold.slotLocalDate,
      slotLocalTime: hold.slotLocalTime,
      expiresAt: hold.expiresAt.toISOString(),
      guestName: entry.name,
      guestEmail: decryptPii(entry.emailEnc),
      guestPhone: decryptPii(entry.phoneEnc),
    };
  }

  async consumeOffer(
    code: string,
    token?: string | null,
  ): Promise<WaitlistAdminDto> {
    const normalizedCode = code.trim();
    const normalizedToken = token?.trim() ?? '';
    if (!normalizedCode || !normalizedToken) {
      throw new NotFoundException('Offer not found');
    }

    const entry = await this.prisma.waitlist.findFirst({
      where: { offerCode: normalizedCode },
      include: this.waitlistInclude,
    });
    if (!entry) {
      throw new NotFoundException('Offer not found');
    }
    if (entry.offerToken !== normalizedToken) {
      throw new NotFoundException('Offer not found');
    }
    if (entry.status === 'CONVERTED') {
      return this.toAdminDto(entry);
    }
    if (entry.status !== 'OFFERED') {
      throw new GoneException('Offer expired');
    }

    const updated = await this.prisma.waitlist.update({
      where: { id: entry.id },
      data: {
        status: 'CONVERTED',
        offerToken: null,
        expiresAt: null,
      },
      include: this.waitlistInclude,
    });

    return this.toAdminDto(updated);
  }

  async findWaitingEntries(limit = 20): Promise<WaitlistWithRelations[]> {
    return this.prisma.waitlist.findMany({
      where: { status: 'WAITING' },
      orderBy: [
        { priority: 'desc' },
        { desiredAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
      include: this.waitlistInclude,
    });
  }

  async listRecentOffers(limit = 20): Promise<WaitlistOfferSummary[]> {
    const take = this.normalizeLimit(limit);
    const logs = await this.prisma.auditLog.findMany({
      where: { action: 'waitlist.offer.sent' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });

    if (logs.length === 0) {
      return [];
    }

    const waitlistIds = logs
      .map((log) =>
        this.extractString(this.coerceJsonObject(log.after), 'waitlistId'),
      )
      .filter((value): value is string => typeof value === 'string');
    const uniqueIds = Array.from(new Set(waitlistIds));

    const waitlists = uniqueIds.length
      ? await this.prisma.waitlist.findMany({
          where: { id: { in: uniqueIds } },
          include: this.waitlistInclude,
        })
      : [];

    const waitlistMap = new Map(waitlists.map((entry) => [entry.id, entry]));

    return logs.map<WaitlistOfferSummary>((log) => {
      const payload = this.coerceJsonObject(log.after);
      const waitlistId = this.extractString(payload, 'waitlistId') ?? undefined;
      const holdId = this.extractString(payload, 'holdId');
      const offerCode = this.extractString(payload, 'offerCode');
      const guestEmail = this.extractString(payload, 'guestEmail');
      const guestName = this.extractString(payload, 'guestName');
      const expiresAt = this.extractString(payload, 'expiresAt');
      const venueId = this.extractString(payload, 'venueId');

      const waitlistEntry = waitlistId
        ? waitlistMap.get(waitlistId)
        : undefined;
      const dto = waitlistEntry ? this.toAdminDto(waitlistEntry) : null;

      return {
        id: log.id,
        waitlistId: waitlistId ?? dto?.id ?? '',
        holdId: holdId ?? dto?.holdId ?? null,
        offerCode: offerCode ?? dto?.offerCode ?? null,
        guestName: guestName ?? dto?.name ?? 'Guest',
        guestEmail: guestEmail ?? dto?.email ?? null,
        venueId: venueId ?? dto?.venueId ?? null,
        venueName: dto?.venueName ?? null,
        status: dto?.status ?? null,
        sentAt: log.createdAt.toISOString(),
        expiresAt: expiresAt ?? dto?.expiresAt ?? null,
      };
    });
  }

  private async assignOffer(
    id: string,
    hold: Hold,
  ): Promise<{ waitlist: WaitlistWithRelations }> {
    let attempts = 0;
    while (attempts < 5) {
      attempts += 1;
      const offerCode = this.generateOfferCode();
      const offerToken = this.generateOfferToken();
      try {
        const result = await this.prisma.waitlist.updateMany({
          where: { id, status: 'WAITING' },
          data: {
            status: 'OFFERED',
            offerCode,
            offerToken,
            holdId: hold.id,
            expiresAt: hold.expiresAt,
          },
        });

        if (result.count === 0) {
          await this.safeCancelHold(hold.id);
          throw new ConflictException('Waitlist entry already updated');
        }

        const updated = await this.prisma.waitlist.findUnique({
          where: { id },
          include: this.waitlistInclude,
        });
        if (!updated) {
          throw new NotFoundException(
            'Waitlist entry missing after offer update',
          );
        }
        return { waitlist: updated };
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          continue;
        }
        await this.safeCancelHold(hold.id);
        throw error;
      }
    }

    await this.safeCancelHold(hold.id);
    throw new ConflictException('Unable to assign unique offer code');
  }

  private async safeCancelHold(holdId: string) {
    try {
      await this.holds.cancel(holdId);
    } catch (error) {
      this.logger.warn(
        `Failed to cancel hold ${holdId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async forceExpire(id: string) {
    await this.prisma.waitlist.update({
      where: { id },
      data: {
        status: 'EXPIRED',
        offerCode: null,
        offerToken: null,
        holdId: null,
        expiresAt: null,
      },
    });
  }

  private toAdminDto(entry: WaitlistWithRelations): WaitlistAdminDto {
    return {
      id: entry.id,
      venueId: entry.venueId,
      venueName: entry.venue.name,
      venueTimezone: entry.venue.timezone,
      name: entry.name,
      email: decryptPii(entry.emailEnc),
      phone: decryptPii(entry.phoneEnc),
      partySize: entry.partySize,
      desiredAt: entry.desiredAt.toISOString(),
      notes: entry.notes,
      priority: entry.priority,
      status: entry.status as WaitlistStatus,
      offerCode: entry.offerCode,
      offerToken: entry.offerToken ?? null,
      holdId: entry.holdId,
      expiresAt: entry.expiresAt ? entry.expiresAt.toISOString() : null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      hold: entry.hold
        ? {
            id: entry.hold.id,
            status: entry.hold.status,
            slotLocalDate: entry.hold.slotLocalDate,
            slotLocalTime: entry.hold.slotLocalTime,
            slotStartUtc: entry.hold.slotStartUtc.toISOString(),
            expiresAt: entry.hold.expiresAt.toISOString(),
          }
        : null,
    };
  }

  private generateOfferCode(length = 8): string {
    let token = '';
    for (let i = 0; i < length; i += 1) {
      const index = Math.floor(Math.random() * OFFER_CODE_ALPHABET.length);
      token += OFFER_CODE_ALPHABET.charAt(index);
    }
    return token;
  }

  private generateOfferToken(length = 24): string {
    return randomBytes(length).toString('base64url');
  }

  private coerceJsonObject(
    value: Prisma.JsonValue,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private extractString(
    record: Record<string, unknown> | null,
    key: string,
  ): string | null {
    if (!record) return null;
    const value = record[key];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseDesiredAt(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('desiredAt must be a valid ISO timestamp');
    }
    return date;
  }

  private parseSlotStart(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('slotStart must be a valid ISO timestamp');
    }
    return date;
  }

  private normalizePartySize(value: number): number {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('partySize must be a positive integer');
    }
    return parsed;
  }

  private normalizePriority(value?: number): number {
    if (value === undefined || value === null) return 0;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(-10, Math.min(100, parsed));
  }

  private normalizeLimit(value?: number): number {
    if (!Number.isFinite(value)) return 50;
    const parsed = Math.floor(Number(value));
    return Math.max(1, Math.min(100, parsed));
  }

  private normalizeTtl(raw?: number): number {
    const minutes = Math.floor(Number(raw ?? DEFAULT_TTL_MINUTES));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return DEFAULT_TTL_MINUTES;
    }
    return Math.max(MIN_TTL_MINUTES, Math.min(MAX_TTL_MINUTES, minutes));
  }

  private toLocalSlot(
    date: Date,
    timeZone: string,
  ): { date: string; time: string } {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const localDate = `${lookup.year}-${lookup.month}-${lookup.day}`;
    const localTime = `${lookup.hour}:${lookup.minute}`;
    return { date: localDate, time: localTime };
  }

  private async pickTable(
    venueId: string,
    date: string,
    time: string,
    partySize: number,
  ): Promise<string | null> {
    try {
      const availability = await this.availability.getAvailability({
        venueId,
        date,
        time,
        partySize,
      });
      if (!availability.tables.length) {
        return null;
      }
      const sorted = [...availability.tables].sort(
        (a, b) => a.capacity - b.capacity,
      );
      return sorted[0]?.id ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to compute availability for ${venueId} ${date} ${time}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async resolveVenue(venueId?: string) {
    const requested = venueId?.trim() || DEFAULT_VENUE_ID;
    if (requested === DEFAULT_VENUE_ID) {
      return ensureDefaultVenue(this.prisma);
    }
    const venue = await this.prisma.venue.findUnique({
      where: { id: requested },
    });
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }
    return venue;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

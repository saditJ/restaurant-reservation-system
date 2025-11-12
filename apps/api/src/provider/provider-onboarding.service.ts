import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ProviderOnboardingApiKeyDto,
  ProviderOnboardingPlanDto,
  ProviderOnboardingShiftsDto,
  ProviderOnboardingTablesDto,
  ProviderOnboardingTenantDto,
  ProviderOnboardingVenueDto,
} from './dto';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ApiKeyService } from '../auth/api-key.service';

type RequestContext = {
  actor: string;
  route?: string;
  method?: string;
  requestId?: string;
};

type ShiftTemplate = 'restaurant' | 'bar' | 'cafe';

@Injectable()
export class ProviderOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  async upsertTenant(dto: ProviderOnboardingTenantDto, ctx: RequestContext) {
    const name = this.normalizeName(dto.name);
    const city = this.normalizeName(dto.city);
    const timezone = this.normalizeTimezone(dto.tz);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenant.findFirst({
        where: {
          name,
          city,
          timezone,
        },
      });
      if (existing) {
        return { tenant: existing, created: false };
      }

      const slug = await this.ensureUniqueTenantSlug(tx, this.slugify(name));
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          city,
          timezone,
          isActive: true,
        },
      });
      return { tenant, created: true };
    });

    await this.audit.record({
      actor: ctx.actor,
      action: result.created
        ? 'provider.onboarding.tenant.create'
        : 'provider.onboarding.tenant.reuse',
      resource: `tenant:${result.tenant.id}`,
      after: {
        tenantId: result.tenant.id,
        slug: result.tenant.slug,
        name: result.tenant.name,
        city: result.tenant.city,
        timezone: result.tenant.timezone,
      },
      route: ctx.route,
      method: ctx.method,
      requestId: ctx.requestId,
      tenantId: result.tenant.id,
    });

    return {
      tenantId: result.tenant.id,
      slug: result.tenant.slug,
      created: result.created,
    };
  }

  async upsertVenue(dto: ProviderOnboardingVenueDto, ctx: RequestContext) {
    const tenantId = dto.tenantId.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const name = this.normalizeName(dto.name);
    const city = this.normalizeName(dto.city);
    const timezone = this.normalizeTimezone(dto.tz);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      const existing = await tx.venue.findFirst({
        where: {
          tenantId,
          name,
          city,
          timezone,
        },
      });
      if (existing) {
        return { venue: existing, created: false };
      }

      const slug = await this.ensureUniqueVenueSlug(
        tx,
        tenant,
        this.slugify(name),
      );
      const venue = await tx.venue.create({
        data: {
          tenantId,
          name,
          city,
          timezone,
          slug,
          isPublic: false,
          floorplanRoomWidth: 1200,
          floorplanRoomHeight: 800,
          floorplanGridSize: 20,
          turnTimeMin: 10,
          holdTtlMin: 15,
          defaultDurationMin: 120,
          cancellationWindowMin: 120,
          guestCanModifyUntilMin: 120,
          retainPersonalDataDays: 365,
        },
      });
      return { venue, created: true };
    });

    await this.audit.record({
      actor: ctx.actor,
      action: result.created
        ? 'provider.onboarding.venue.create'
        : 'provider.onboarding.venue.reuse',
      resource: `venue:${result.venue.id}`,
      after: {
        venueId: result.venue.id,
        tenantId: result.venue.tenantId,
        name: result.venue.name,
        city: result.venue.city,
        timezone: result.venue.timezone,
      },
      route: ctx.route,
      method: ctx.method,
      requestId: ctx.requestId,
      tenantId: result.venue.tenantId,
    });

    return {
      venueId: result.venue.id,
      slug: result.venue.slug,
      created: result.created,
    };
  }

  async seedShifts(dto: ProviderOnboardingShiftsDto, ctx: RequestContext) {
    const venueId = dto.venueId.trim();
    if (!venueId) {
      throw new BadRequestException('venueId is required');
    }
    const template = dto.template;

    const result = await this.prisma.$transaction(async (tx) => {
      const venue = await tx.venue.findUnique({
        where: { id: venueId },
        select: { id: true, tenantId: true, timezone: true },
      });
      if (!venue) {
        throw new NotFoundException(`Venue ${venueId} not found`);
      }
      const blueprint = SHIFT_TEMPLATES[template];
      if (!blueprint) {
        throw new BadRequestException(`Unknown template ${template}`);
      }

      const existing = await tx.shift.findMany({
        where: { venueId },
        select: {
          id: true,
          dow: true,
          startsAtLocal: true,
          endsAtLocal: true,
          capacitySeats: true,
          capacityCovers: true,
        },
      });
      const existingMap = new Map<string, (typeof existing)[number]>();
      for (const entry of existing) {
        existingMap.set(
          this.shiftKey(entry.dow, entry.startsAtLocal, entry.endsAtLocal),
          entry,
        );
      }

      let created = 0;
      let updated = 0;
      for (const shift of blueprint) {
        const starts = this.timeToDate(shift.start);
        const ends = this.timeToDate(shift.end);
        const key = this.shiftKey(shift.dow, starts, ends);
        const found = existingMap.get(key);
        if (found) {
          if (
            found.capacitySeats !== shift.capacitySeats ||
            found.capacityCovers !== shift.capacityCovers
          ) {
            await tx.shift.update({
              where: { id: found.id },
              data: {
                capacitySeats: shift.capacitySeats,
                capacityCovers: shift.capacityCovers,
                isActive: true,
              },
            });
            updated += 1;
          }
          continue;
        }

        await tx.shift.create({
          data: {
            venueId,
            dow: shift.dow,
            startsAtLocal: starts,
            endsAtLocal: ends,
            capacitySeats: shift.capacitySeats,
            capacityCovers: shift.capacityCovers,
            isActive: true,
          },
        });
        created += 1;
      }

      return {
        venueId,
        created,
        updated,
        total: existing.length + created,
        tenantId: venue.tenantId,
      };
    });

    await this.audit.record({
      actor: ctx.actor,
      action: 'provider.onboarding.shifts.seed',
      resource: `venue:${dto.venueId}`,
      after: {
        venueId: dto.venueId,
        template,
        created: result.created,
        updated: result.updated,
      },
      route: ctx.route,
      method: ctx.method,
      requestId: ctx.requestId,
      tenantId: result.tenantId,
    });

    return {
      venueId: dto.venueId,
      template,
      created: result.created,
      updated: result.updated,
      total: result.total,
    };
  }

  async seedTables(dto: ProviderOnboardingTablesDto, ctx: RequestContext) {
    const venueId = dto.venueId.trim();
    if (!venueId) {
      throw new BadRequestException('venueId is required');
    }
    if (dto.max < dto.min) {
      throw new BadRequestException('max capacity must be >= min');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const venue = await tx.venue.findUnique({
        where: { id: venueId },
        select: { id: true, tenantId: true },
      });
      if (!venue) {
        throw new NotFoundException(`Venue ${venueId} not found`);
      }

      const existing = await tx.table.findMany({
        where: { venueId },
        select: { id: true, label: true, capacity: true, minSeating: true },
      });
      const existingMap = new Map(
        existing.map((table) => [table.label, table]),
      );
      const toCreate: Prisma.TableCreateManyInput[] = [];
      const toUpdate: Array<{
        id: string;
        capacity: number;
        minSeating: number;
      }> = [];

      for (let row = 0; row < dto.grid.rows; row += 1) {
        for (let col = 0; col < dto.grid.cols; col += 1) {
          const label = `${this.rowLabel(row)}${col + 1}`;
          const capacity = this.deriveCapacity(row, col, dto.min, dto.max);
          const blueprint: Prisma.TableCreateManyInput = {
            venueId,
            label,
            capacity,
            minSeating: dto.min,
            zone: 'Main',
            area: 'Main',
            joinGroupId: `ROW-${this.rowLabel(row)}`,
            x: col * 90,
            y: row * 90,
            angle: 0,
            shape: 'rect',
            w: 60,
            h: 60,
            width: 60,
            height: 60,
          };
          const found = existingMap.get(label);
          if (found) {
            if (
              found.capacity !== capacity ||
              (found.minSeating ?? dto.min) !== dto.min
            ) {
              toUpdate.push({
                id: found.id,
                capacity,
                minSeating: dto.min,
              });
            }
            continue;
          }
          toCreate.push(blueprint);
        }
      }

      if (toCreate.length) {
        await tx.table.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
      }

      for (const table of toUpdate) {
        await tx.table.update({
          where: { id: table.id },
          data: {
            capacity: table.capacity,
            minSeating: table.minSeating,
          },
        });
      }

      return {
        created: toCreate.length,
        updated: toUpdate.length,
        total: existing.length + toCreate.length,
        tenantId: venue.tenantId,
      };
    });

    await this.audit.record({
      actor: ctx.actor,
      action: 'provider.onboarding.tables.seed',
      resource: `venue:${venueId}`,
      after: {
        venueId,
        created: result.created,
        updated: result.updated,
        total: result.total,
      },
      route: ctx.route,
      method: ctx.method,
      requestId: ctx.requestId,
      tenantId: result.tenantId,
    });

    return {
      venueId,
      created: result.created,
      updated: result.updated,
      total: result.total,
    };
  }

  async provisionApiKey(dto: ProviderOnboardingApiKeyDto, ctx: RequestContext) {
    const tenantId = dto.tenantId.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const plan = this.normalizePlan(dto.plan);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true },
      });
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      const keyName = this.buildKeyName(tenant);
      const existing = await tx.apiKey.findFirst({
        where: {
          tenantId,
          name: keyName,
          rateLimitPerMin: plan.rps,
          burstLimit: plan.burst,
          monthlyCap: plan.monthlyCap,
        },
      });
      if (existing) {
        return { key: existing, plaintext: null as string | null };
      }

      const plaintext = this.apiKeys.generatePlaintextKey();
      const hashedKey = this.apiKeys.hashKey(plaintext);
      const created = await tx.apiKey.create({
        data: {
          tenantId,
          name: keyName,
          hashedKey,
          rateLimitPerMin: plan.rps,
          burstLimit: plan.burst,
          monthlyCap: plan.monthlyCap,
          scopeJSON: ['provider'],
          tokenPreview: this.apiKeys.formatTokenPreview(plaintext),
        },
      });
      return { key: created, plaintext };
    });

    await this.audit.record({
      actor: ctx.actor,
      action: result.plaintext
        ? 'provider.onboarding.apikey.create'
        : 'provider.onboarding.apikey.reuse',
      resource: `tenant:${tenantId}`,
      after: {
        apiKeyId: result.key.id,
        tenantId,
        rateLimitPerMin: result.key.rateLimitPerMin,
        burstLimit: result.key.burstLimit,
        monthlyCap: result.key.monthlyCap,
      },
      route: ctx.route,
      method: ctx.method,
      requestId: ctx.requestId,
      tenantId,
    });

    return {
      apiKeyId: result.key.id,
      tenantId,
      rateLimitPerMin: result.key.rateLimitPerMin,
      burstLimit: result.key.burstLimit,
      monthlyCap: result.key.monthlyCap,
      maskedKey: result.key.tokenPreview ?? null,
      plaintextKey: result.plaintext,
      reused: !result.plaintext,
    };
  }

  private normalizeName(value: string) {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException('Name is required');
    }
    return trimmed;
  }

  private normalizeTimezone(value: string) {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException('Timezone is required');
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
      return trimmed;
    } catch {
      throw new BadRequestException(`Invalid timezone "${value}"`);
    }
  }

  private slugify(value: string) {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 40);
    return slug || 'tenant';
  }

  private async ensureUniqueTenantSlug(
    tx: Prisma.TransactionClient,
    base: string,
  ) {
    let attempt = 0;
    while (attempt < 100) {
      const slug = attempt === 0 ? base : `${base}-${attempt}`;
      const existing = await tx.tenant.findUnique({ where: { slug } });
      if (!existing) {
        return slug;
      }
      attempt += 1;
    }
    throw new Error('Unable to allocate unique tenant slug');
  }

  private async ensureUniqueVenueSlug(
    tx: Prisma.TransactionClient,
    tenant: { id: string; slug: string | null },
    base: string,
  ) {
    const prefix = tenant.slug ? `${tenant.slug}-${base}` : base;
    let attempt = 0;
    while (attempt < 100) {
      const slug = attempt === 0 ? prefix : `${prefix}-${attempt}`;
      const existing = await tx.venue.findUnique({ where: { slug } });
      if (!existing) {
        return slug;
      }
      attempt += 1;
    }
    throw new Error('Unable to allocate unique venue slug');
  }

  private shiftKey(dow: number, start: Date, end: Date) {
    return `${dow}|${start.toISOString()}|${end.toISOString()}`;
  }

  private timeToDate(value: string) {
    const [hours, minutes] = value.split(':').map((part) => Number(part));
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      throw new BadRequestException(`Invalid time "${value}"`);
    }
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
  }

  private rowLabel(index: number) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let n = index;
    let label = '';
    do {
      label = `${letters[n % letters.length]}${label}`;
      n = Math.floor(n / letters.length) - 1;
    } while (n >= 0);
    return label;
  }

  private deriveCapacity(row: number, col: number, min: number, max: number) {
    if (min === max) {
      return min;
    }
    const span = max - min + 1;
    const value = (row * 31 + col * 17) % span;
    return min + value;
  }

  private normalizePlan(plan: ProviderOnboardingPlanDto) {
    const rps = Math.min(Math.max(plan.rps, 1), 10_000);
    const burst = Math.min(Math.max(plan.burst, 1), 20_000);
    const monthlyCap = Math.min(Math.max(plan.monthlyCap, 1_000), 50_000_000);
    return { rps, burst, monthlyCap };
  }

  private buildKeyName(tenant: { name: string; slug: string | null }) {
    const slug = tenant.slug ?? this.slugify(tenant.name);
    return `${slug} provider access`;
  }
}

const SHIFT_TEMPLATES: Record<
  ShiftTemplate,
  Array<{
    dow: number;
    start: string;
    end: string;
    capacitySeats: number;
    capacityCovers: number;
  }>
> = {
  restaurant: [
    {
      dow: 0,
      start: '10:00',
      end: '15:00',
      capacitySeats: 40,
      capacityCovers: 160,
    },
    {
      dow: 0,
      start: '18:00',
      end: '22:00',
      capacitySeats: 40,
      capacityCovers: 160,
    },
    {
      dow: 1,
      start: '10:00',
      end: '22:30',
      capacitySeats: 42,
      capacityCovers: 168,
    },
    {
      dow: 2,
      start: '10:00',
      end: '22:30',
      capacitySeats: 42,
      capacityCovers: 168,
    },
    {
      dow: 3,
      start: '10:00',
      end: '23:00',
      capacitySeats: 45,
      capacityCovers: 180,
    },
    {
      dow: 4,
      start: '10:00',
      end: '23:30',
      capacitySeats: 48,
      capacityCovers: 192,
    },
    {
      dow: 5,
      start: '10:00',
      end: '23:30',
      capacitySeats: 48,
      capacityCovers: 192,
    },
    {
      dow: 6,
      start: '10:00',
      end: '23:00',
      capacitySeats: 44,
      capacityCovers: 176,
    },
  ],
  bar: [
    {
      dow: 0,
      start: '16:00',
      end: '23:30',
      capacitySeats: 30,
      capacityCovers: 120,
    },
    {
      dow: 1,
      start: '16:00',
      end: '23:30',
      capacitySeats: 32,
      capacityCovers: 128,
    },
    {
      dow: 2,
      start: '16:00',
      end: '23:30',
      capacitySeats: 32,
      capacityCovers: 128,
    },
    {
      dow: 3,
      start: '16:00',
      end: '23:45',
      capacitySeats: 35,
      capacityCovers: 140,
    },
    {
      dow: 4,
      start: '16:00',
      end: '23:59',
      capacitySeats: 38,
      capacityCovers: 152,
    },
    {
      dow: 5,
      start: '14:00',
      end: '23:59',
      capacitySeats: 38,
      capacityCovers: 152,
    },
    {
      dow: 6,
      start: '14:00',
      end: '23:30',
      capacitySeats: 36,
      capacityCovers: 144,
    },
  ],
  cafe: [
    {
      dow: 0,
      start: '08:00',
      end: '14:00',
      capacitySeats: 24,
      capacityCovers: 96,
    },
    {
      dow: 1,
      start: '07:00',
      end: '16:00',
      capacitySeats: 28,
      capacityCovers: 112,
    },
    {
      dow: 2,
      start: '07:00',
      end: '16:00',
      capacitySeats: 28,
      capacityCovers: 112,
    },
    {
      dow: 3,
      start: '07:00',
      end: '16:00',
      capacitySeats: 28,
      capacityCovers: 112,
    },
    {
      dow: 4,
      start: '07:00',
      end: '16:00',
      capacitySeats: 30,
      capacityCovers: 120,
    },
    {
      dow: 5,
      start: '07:00',
      end: '18:00',
      capacitySeats: 30,
      capacityCovers: 120,
    },
    {
      dow: 6,
      start: '08:00',
      end: '16:00',
      capacitySeats: 26,
      capacityCovers: 104,
    },
  ],
};

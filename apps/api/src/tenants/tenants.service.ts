import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  UpdateTenantThemeDto,
  ThemeConfigDto,
  ThemeColorsDto,
} from './dto/update-tenant-theme.dto';
import {
  normalizeDomain,
  registerTenantHostLookup,
} from './tenant-host.helper';

export type TenantThemeColors = {
  primary?: string;
  secondary?: string;
  background?: string;
  foreground?: string;
};

export type TenantTheme = {
  colors?: TenantThemeColors;
  logoUrl?: string | null;
  font?: string | null;
};

export type TenantThemeResponse = {
  tenantId: string;
  theme: TenantTheme | null;
  domains: string[];
};

@Injectable()
export class TenantsService {
  private readonly domainCache = new TenantDomainCache();

  constructor(private readonly prisma: PrismaService) {
    registerTenantHostLookup((host) => this.resolveTenantIdByDomain(host));
  }

  async getTheme(tenantId: string): Promise<TenantThemeResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, theme: true, domains: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return {
      tenantId: tenant.id,
      theme: this.projectTheme(tenant.theme),
      domains: [...(tenant.domains ?? [])],
    };
  }

  async updateTheme(
    tenantId: string,
    dto: UpdateTenantThemeDto,
  ): Promise<TenantThemeResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, domains: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const data: Prisma.TenantUpdateInput = {};
    let fieldsChanged = false;
    const invalidatedDomains =
      dto.domains !== undefined ? new Set<string>() : undefined;

    if (dto.theme !== undefined) {
      data.theme = this.prepareThemePayload(dto.theme);
      fieldsChanged = true;
    }

    if (dto.domains !== undefined) {
      const normalizedDomains = this.prepareDomains(dto.domains);
      data.domains = normalizedDomains;
      fieldsChanged = true;
      const previous = tenant.domains ?? [];
      for (const existing of previous) {
        const normalized = normalizeDomain(existing) ?? existing;
        invalidatedDomains?.add(normalized);
      }
      for (const domain of normalizedDomains) {
        invalidatedDomains?.add(domain);
      }
    }

    if (!fieldsChanged) {
      return this.getTheme(tenantId);
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: { id: true, theme: true, domains: true },
    });

    if (invalidatedDomains && invalidatedDomains.size > 0) {
      this.domainCache.invalidate(invalidatedDomains);
    }

    return {
      tenantId: updated.id,
      theme: this.projectTheme(updated.theme),
      domains: [...(updated.domains ?? [])],
    };
  }

  async resolveTenantIdByDomain(host: string): Promise<string | undefined> {
    const normalized = normalizeDomain(host);
    if (!normalized) {
      return undefined;
    }

    const cached = this.domainCache.get(normalized);
    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const record = await this.prisma.tenant.findFirst({
      where: {
        domains: { has: normalized },
        isActive: true,
      },
      select: { id: true },
    });

    this.domainCache.set(normalized, record?.id ?? null);
    return record?.id;
  }

  private prepareDomains(domains: string[]): string[] {
    const normalized = domains
      .map((domain) => normalizeDomain(domain))
      .filter((value): value is string => Boolean(value));
    return Array.from(new Set(normalized));
  }

  private prepareThemePayload(
    theme: ThemeConfigDto | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (!theme) {
      return Prisma.JsonNull;
    }

    const colors = this.sanitizeColors(theme.colors);
    const logoUrl = sanitizeString(theme.logoUrl);
    const font = sanitizeString(theme.font);

    const payload: Record<string, unknown> = {};
    if (colors && Object.keys(colors).length > 0) {
      payload.colors = colors;
    }
    if (logoUrl !== undefined) {
      payload.logoUrl = logoUrl;
    }
    if (font !== undefined) {
      payload.font = font;
    }

    return Object.keys(payload).length > 0
      ? (payload as Prisma.InputJsonObject)
      : Prisma.JsonNull;
  }

  private sanitizeColors(
    colors: ThemeColorsDto | null | undefined,
  ): TenantThemeColors | undefined {
    if (!colors) {
      return undefined;
    }
    const next: TenantThemeColors = {};
    const entries: Array<[keyof ThemeColorsDto, keyof TenantThemeColors]> = [
      ['primary', 'primary'],
      ['secondary', 'secondary'],
      ['background', 'background'],
      ['foreground', 'foreground'],
    ];
    for (const [sourceKey, targetKey] of entries) {
      const value = sanitizeColor(colors[sourceKey]);
      if (value) {
        next[targetKey] = value;
      }
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }

  private projectTheme(value: Prisma.JsonValue | null): TenantTheme | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const payload = value as Record<string, unknown>;
    const theme: TenantTheme = {};

    const colorsEntry = payload.colors;
    if (
      colorsEntry &&
      typeof colorsEntry === 'object' &&
      !Array.isArray(colorsEntry)
    ) {
      const normalizedColors = this.sanitizeColors(
        colorsEntry as ThemeColorsDto,
      );
      if (normalizedColors) {
        theme.colors = normalizedColors;
      }
    }

    const logoUrl = sanitizeString(payload.logoUrl);
    if (logoUrl !== undefined) {
      theme.logoUrl = logoUrl;
    }

    const font = sanitizeString(payload.font);
    if (font !== undefined) {
      theme.font = font;
    }

    return Object.keys(theme).length > 0 ? theme : null;
  }
}

class TenantDomainCache {
  private readonly store = new Map<
    string,
    { expiresAt: number; tenantId: string | null }
  >();

  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  get(domain: string): string | null | undefined {
    const entry = this.store.get(domain);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(domain);
      return undefined;
    }
    return entry.tenantId;
  }

  set(domain: string, tenantId: string | null) {
    this.store.set(domain, {
      tenantId,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(domains?: Iterable<string>) {
    if (!domains) {
      this.store.clear();
      return;
    }
    for (const domain of domains) {
      this.store.delete(domain);
    }
  }
}

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function sanitizeColor(value: unknown): string | undefined {
  return sanitizeString(value);
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Menu, MenuSection, MenuItem } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type MenuItemSummary = {
  id: string;
  name: string;
  short: string | null;
  price: number;
  currency: string;
  isAvailable: boolean;
  imageUrl: string | null;
  tags: string[];
  position: number;
};

export type MenuSectionSummary = {
  id?: string;
  title: string;
  position: number;
  items: MenuItemSummary[];
};

export type PublicMenuResponse = {
  sections: MenuSectionSummary[];
};

export type AdminMenuSection = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  items: MenuItemSummary[];
};

type CreateSectionInput = {
  title: string;
  description?: string | null;
  position?: number;
};

type UpdateSectionInput = {
  title?: string;
  description?: string | null;
  position?: number;
};

type CreateMenuItemInput = {
  name: string;
  short?: string | null;
  price: number;
  currency: 'ALL' | 'EUR';
  isAvailable?: boolean;
  imageUrl?: string | null;
  tags?: string[];
  position?: number;
};

type UpdateMenuItemInput = Partial<CreateMenuItemInput>;

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicMenu(venueId: string): Promise<PublicMenuResponse> {
    const menu = await this.prisma.menu.findFirst({
      where: { venueId, isActive: true, isPublic: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        sections: {
          orderBy: { displayOrder: 'asc' },
          include: {
            items: {
              where: { isAvailable: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!menu) {
      return { sections: [] };
    }

    return {
      sections: menu.sections.map((section) => this.toSectionSummary(section)),
    };
  }

  async listAdminSections(venueId: string): Promise<{
    menu: Menu;
    sections: AdminMenuSection[];
  }> {
    const menu = await this.ensureMenuForVenue(venueId);
    const sections = await this.prisma.menuSection.findMany({
      where: { menuId: menu.id },
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return {
      menu,
      sections: sections.map((section) => this.toAdminSection(section)),
    };
  }

  async createSection(
    venueId: string,
    input: CreateSectionInput,
  ): Promise<AdminMenuSection> {
    const menu = await this.ensureMenuForVenue(venueId);
    const position =
      input.position ??
      (await this.prisma.menuSection.count({ where: { menuId: menu.id } }));

    const section = await this.prisma.menuSection.create({
      data: {
        menuId: menu.id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        displayOrder: this.normalizePosition(position),
      },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return this.toAdminSection(section);
  }

  async updateSection(
    venueId: string,
    sectionId: string,
    input: UpdateSectionInput,
  ): Promise<AdminMenuSection> {
    const section = await this.ensureSection(venueId, sectionId);

    const data: Prisma.MenuSectionUpdateInput = {};
    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (!trimmed) {
        throw new BadRequestException('Section title cannot be empty');
      }
      data.title = trimmed;
    }
    if (input.description !== undefined) {
      const desc = input.description?.trim();
      data.description = desc && desc.length > 0 ? desc : null;
    }
    if (input.position !== undefined) {
      data.displayOrder = this.normalizePosition(input.position);
    }

    const updated = await this.prisma.menuSection.update({
      where: { id: section.id },
      data,
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return this.toAdminSection(updated);
  }

  async deleteSection(
    venueId: string,
    sectionId: string,
  ): Promise<{ deleted: boolean }> {
    const section = await this.ensureSection(venueId, sectionId);
    await this.prisma.menuSection.delete({ where: { id: section.id } });
    return { deleted: true };
  }

  async listItems(
    venueId: string,
    sectionId: string,
  ): Promise<{ section: MenuSection; items: MenuItemSummary[] }> {
    const section = await this.ensureSection(venueId, sectionId, true);
    return {
      section,
      items: section.items.map((item) => this.toMenuItemSummary(item)),
    };
  }

  async createItem(
    venueId: string,
    sectionId: string,
    input: CreateMenuItemInput,
  ): Promise<MenuItemSummary> {
    const section = await this.ensureSection(venueId, sectionId);
    const position =
      input.position ??
      (await this.prisma.menuItem.count({ where: { sectionId: section.id } }));

    const item = await this.prisma.menuItem.create({
      data: {
        sectionId: section.id,
        name: input.name.trim(),
        short: this.normalizeOptionalString(input.short),
        description: this.normalizeOptionalString(input.short),
        price: this.toPriceDecimal(input.price),
        currency: input.currency,
        isAvailable: input.isAvailable ?? true,
        imageUrl: this.normalizeOptionalString(input.imageUrl),
        tags: this.normalizeTags(input.tags),
        displayOrder: this.normalizePosition(position),
      },
    });

    return this.toMenuItemSummary(item);
  }

  async updateItem(
    venueId: string,
    sectionId: string,
    itemId: string,
    input: UpdateMenuItemInput,
  ): Promise<MenuItemSummary> {
    const item = await this.ensureItem(venueId, sectionId, itemId);
    const data: Prisma.MenuItemUpdateInput = {};

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        throw new BadRequestException('Item name is required');
      }
      data.name = trimmed;
    }
    if (input.short !== undefined) {
      const shortText = this.normalizeOptionalString(input.short);
      data.short = shortText;
      data.description = shortText;
    }
    if (input.price !== undefined) {
      data.price = this.toPriceDecimal(input.price);
    }
    if (input.currency !== undefined) {
      data.currency = input.currency;
    }
    if (input.isAvailable !== undefined) {
      data.isAvailable = input.isAvailable;
    }
    if (input.imageUrl !== undefined) {
      data.imageUrl = this.normalizeOptionalString(input.imageUrl);
    }
    if (input.tags !== undefined) {
      data.tags = this.normalizeTags(input.tags);
    }
    if (input.position !== undefined) {
      data.displayOrder = this.normalizePosition(input.position);
    }

    const updated = await this.prisma.menuItem.update({
      where: { id: item.id },
      data,
    });

    return this.toMenuItemSummary(updated);
  }

  async deleteItem(
    venueId: string,
    sectionId: string,
    itemId: string,
  ): Promise<{ deleted: boolean }> {
    const item = await this.ensureItem(venueId, sectionId, itemId);
    await this.prisma.menuItem.delete({ where: { id: item.id } });
    return { deleted: true };
  }

  private async ensureMenuForVenue(venueId: string): Promise<Menu> {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, tenantId: true, name: true },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    const existing = await this.prisma.menu.findFirst({
      where: { venueId: venue.id },
      orderBy: { displayOrder: 'asc' },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.menu.create({
      data: {
        tenantId: venue.tenantId,
        venueId: venue.id,
        name: `${venue.name ?? 'Menu'}`,
        description: null,
        isActive: true,
        isPublic: true,
        displayOrder: 0,
      },
    });
  }

  private async ensureSection(
    venueId: string,
    sectionId: string,
    includeItems = false,
  ): Promise<MenuSection & { items: MenuItem[] }> {
    const section = await this.prisma.menuSection.findFirst({
      where: {
        id: sectionId,
        menu: { venueId },
      },
      include: {
        items: includeItems
          ? {
              orderBy: { displayOrder: 'asc' },
            }
          : false,
      },
    });

    if (!section) {
      throw new NotFoundException('Menu section not found');
    }

    return section as MenuSection & { items: MenuItem[] };
  }

  private async ensureItem(
    venueId: string,
    sectionId: string,
    itemId: string,
  ): Promise<MenuItem> {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: itemId,
        section: {
          id: sectionId,
          menu: { venueId },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Menu item not found');
    }

    return item;
  }

  private normalizePosition(value: number | undefined | null): number {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(0, Math.floor(value));
  }

  private normalizeOptionalString(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeTags(value?: string[]): string[] {
    if (!value) return [];
    return Array.from(
      new Set(value.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    );
  }

  private toPriceDecimal(value: number): Prisma.Decimal {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('Price must be a non-negative number');
    }
    return new Prisma.Decimal(Math.floor(value));
  }

  private toMenuItemSummary(item: MenuItem): MenuItemSummary {
    return {
      id: item.id,
      name: item.name,
      short: item.short ?? item.description ?? null,
      price: Number(item.price),
      currency: item.currency,
      isAvailable: item.isAvailable,
      imageUrl: item.imageUrl ?? null,
      tags: item.tags ?? [],
      position: item.displayOrder,
    };
  }

  private toSectionSummary(
    section: MenuSection & { items: MenuItem[] },
  ): MenuSectionSummary {
    return {
      id: section.id,
      title: section.title,
      position: section.displayOrder,
      items: section.items.map((item) => this.toMenuItemSummary(item)),
    };
  }

  private toAdminSection(
    section: MenuSection & { items: MenuItem[] },
  ): AdminMenuSection {
    return {
      id: section.id,
      title: section.title,
      description: section.description,
      position: section.displayOrder,
      items: section.items.map((item) => this.toMenuItemSummary(item)),
    };
  }
}

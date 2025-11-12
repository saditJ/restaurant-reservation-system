import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminApiGuard } from '../auth/admin-api.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  MenusService,
  AdminMenuSection,
  MenuItemSummary,
} from './menus.service';

class CreateSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

class BaseItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  short?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @IsString()
  @IsIn(['ALL', 'EUR'])
  currency!: 'ALL' | 'EUR';

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

class UpdateItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  short?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @IsIn(['ALL', 'EUR'])
  currency?: 'ALL' | 'EUR';

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

@Controller('v1/admin/menus')
@UseGuards(ApiKeyGuard, AdminApiGuard, RateLimitGuard)
@Roles('owner', 'manager')
export class AdminMenusController {
  constructor(private readonly menus: MenusService) {}

  @Get(':venueId/sections')
  async listSections(
    @Param('venueId') venueId: string,
  ): Promise<{ sections: AdminMenuSection[] }> {
    const result = await this.menus.listAdminSections(venueId);
    return { sections: result.sections };
  }

  @Post(':venueId/sections')
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  async createSection(
    @Param('venueId') venueId: string,
    @Body() body: CreateSectionDto,
  ): Promise<{ section: AdminMenuSection }> {
    const section = await this.menus.createSection(venueId, body);
    return { section };
  }

  @Patch(':venueId/sections/:sectionId')
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  async updateSection(
    @Param('venueId') venueId: string,
    @Param('sectionId') sectionId: string,
    @Body() body: UpdateSectionDto,
  ): Promise<{ section: AdminMenuSection }> {
    const section = await this.menus.updateSection(venueId, sectionId, body);
    return { section };
  }

  @Delete(':venueId/sections/:sectionId')
  @RateLimit({ requestsPerMinute: 60, burstLimit: 30 })
  async deleteSection(
    @Param('venueId') venueId: string,
    @Param('sectionId') sectionId: string,
  ): Promise<{ deleted: boolean }> {
    return this.menus.deleteSection(venueId, sectionId);
  }

  @Get(':venueId/sections/:sectionId/items')
  async listItems(
    @Param('venueId') venueId: string,
    @Param('sectionId') sectionId: string,
  ): Promise<{ items: MenuItemSummary[] }> {
    const result = await this.menus.listItems(venueId, sectionId);
    return { items: result.items };
  }

  @Post(':venueId/sections/:sectionId/items')
  @RateLimit({ requestsPerMinute: 80, burstLimit: 40 })
  async createItem(
    @Param('venueId') venueId: string,
    @Param('sectionId') sectionId: string,
    @Body() body: BaseItemDto,
  ): Promise<{ item: MenuItemSummary }> {
    const item = await this.menus.createItem(venueId, sectionId, body);
    return { item };
  }

  @Patch(':venueId/sections/:sectionId/items/:itemId')
  @RateLimit({ requestsPerMinute: 80, burstLimit: 40 })
  async updateItem(
    @Param('venueId') venueId: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateItemDto,
  ): Promise<{ item: MenuItemSummary }> {
    const item = await this.menus.updateItem(venueId, sectionId, itemId, body);
    return { item };
  }

  @Delete(':venueId/sections/:sectionId/items/:itemId')
  @RateLimit({ requestsPerMinute: 80, burstLimit: 40 })
  async deleteItem(
    @Param('venueId') venueId: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
  ): Promise<{ deleted: boolean }> {
    return this.menus.deleteItem(venueId, sectionId, itemId);
  }
}

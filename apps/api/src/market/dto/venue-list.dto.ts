import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsNumber,
  IsBoolean,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toNumberArray, toStringArray } from './transform.utils';

export class VenueSearchDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  city?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  cuisine?: string[];

  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4, { each: true })
  priceLevel?: number[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  minRating?: number;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  openNow?: boolean;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number = 24;
}

export interface VenueListItemDto {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  cuisines: string[];
  heroImageUrl: string | null;
  priceLevel: number | null;
  rating: number | null;
  reviewCount: number;
  tags: string[];
  shortDescription: string | null;
  nextAvailable: string | null; // ISO datetime or null
  distance?: number | null; // km from search location
}

export interface VenueListResponseDto {
  items: VenueListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

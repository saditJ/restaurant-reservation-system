import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toStringArray, toNumberArray } from './transform.utils';

export class VenueFacetsDto {
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
}

export type VenueFacetBucket = {
  value: string;
  count: number;
};

export type VenueFacetResponseDto = {
  city: VenueFacetBucket[];
  cuisine: VenueFacetBucket[];
  priceLevel: Array<{ value: number; count: number }>;
};

import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_DIMENSION = 5000;

export class FloorplanRoomDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DIMENSION)
  w?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DIMENSION)
  h?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION)
  grid?: number;
}

export class FloorplanTableDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DIMENSION)
  x?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DIMENSION)
  y?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-MAX_DIMENSION)
  @Max(MAX_DIMENSION)
  angle?: number;

  @IsOptional()
  @IsString()
  @IsIn(['rect', 'circle', 'booth'])
  shape?: 'rect' | 'circle' | 'booth';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DIMENSION)
  w?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_DIMENSION)
  h?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION)
  min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION)
  max?: number;

  @IsOptional()
  @IsString()
  zone?: string;
}

export class UpdateFloorplanDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => FloorplanRoomDto)
  room?: FloorplanRoomDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FloorplanTableDto)
  tables?: FloorplanTableDto[];
}

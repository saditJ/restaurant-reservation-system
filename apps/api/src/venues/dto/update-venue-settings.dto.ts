import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateVenueSettingsDto {
  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @IsOptional()
  @IsObject()
  hours?: Record<string, unknown> | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  turnTimeMin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  holdTtlMin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(15)
  defaultDurationMin!: number;
}

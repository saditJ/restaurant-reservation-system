import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsISO8601,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWaitlistDto {
  @IsOptional()
  @IsString()
  venueId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  partySize!: number;

  @IsISO8601()
  desiredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-10)
  @Max(100)
  priority?: number;
}

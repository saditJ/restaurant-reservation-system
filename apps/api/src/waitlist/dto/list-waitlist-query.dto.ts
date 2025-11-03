import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { WAITLIST_STATUSES, WaitlistStatus } from '../waitlist.types';

export class ListWaitlistQueryDto {
  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsIn(WAITLIST_STATUSES)
  status?: WaitlistStatus;

  @IsOptional()
  @IsISO8601()
  desiredFrom?: string;

  @IsOptional()
  @IsISO8601()
  desiredTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

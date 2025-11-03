import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Min, Max } from 'class-validator';

export class OfferWaitlistDto {
  @IsISO8601()
  slotStart!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  ttlMinutes?: number;
}

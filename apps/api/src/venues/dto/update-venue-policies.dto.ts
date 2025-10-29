import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateVenuePoliciesDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cancellationWindowMin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  guestCanModifyUntilMin!: number;

  @IsBoolean()
  noShowFeePolicy!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  retainPersonalDataDays!: number;
}

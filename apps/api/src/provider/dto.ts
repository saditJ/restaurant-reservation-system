import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProviderUsageKeysQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ProviderUsageKeyTimeseriesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class ProviderUsageTenantsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ProviderOnboardingTenantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  tz!: string;
}

export class ProviderOnboardingVenueDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  tz!: string;
}

export class ProviderOnboardingShiftsDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;

  @IsString()
  @IsIn(['restaurant', 'bar', 'cafe'])
  template!: 'restaurant' | 'bar' | 'cafe';
}

export class ProviderOnboardingTablesGridDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  rows!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  cols!: number;
}

export class ProviderOnboardingTablesDto {
  @IsString()
  @IsNotEmpty()
  venueId!: string;

  @ValidateNested()
  @Type(() => ProviderOnboardingTablesGridDto)
  grid!: ProviderOnboardingTablesGridDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  min!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  max!: number;
}

export class ProviderOnboardingPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  rps!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000)
  burst!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(50_000_000)
  monthlyCap!: number;
}

export class ProviderOnboardingApiKeyDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ValidateNested()
  @Type(() => ProviderOnboardingPlanDto)
  plan!: ProviderOnboardingPlanDto;
}

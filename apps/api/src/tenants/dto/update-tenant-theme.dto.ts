import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ThemeColorsDto {
  @IsOptional()
  @IsString()
  primary?: string;

  @IsOptional()
  @IsString()
  secondary?: string;

  @IsOptional()
  @IsString()
  background?: string;

  @IsOptional()
  @IsString()
  foreground?: string;
}

export class ThemeConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors?: ThemeColorsDto;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  font?: string | null;
}

export class UpdateTenantThemeDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeConfigDto)
  theme?: ThemeConfigDto | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];
}

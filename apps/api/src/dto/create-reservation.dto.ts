// apps/api/src/dto/create-reservation.dto.ts
import { ReservationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class GuestDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateReservationDto {
  @IsOptional()
  @IsString()
  holdId?: string;

  @ValidateNested()
  @Type(() => GuestDto)
  guest!: GuestDto;

  @IsOptional()
  @IsString()
  code?: string;

  @ValidateIf((dto) => !dto.holdId)
  @IsString()
  @IsNotEmpty()
  venueId?: string;

  @ValidateIf((dto) => !dto.holdId)
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string; // YYYY-MM-DD in venue timezone

  @ValidateIf((dto) => !dto.holdId)
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}$/)
  time?: string; // HH:MM (24h)

  @ValidateIf((dto) => !dto.holdId)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  partySize?: number;

  @IsOptional()
  @IsUUID()
  tableId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

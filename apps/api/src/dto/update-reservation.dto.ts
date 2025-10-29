// apps/api/src/dto/update-reservation.dto.ts
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
} from 'class-validator';

export class UpdateReservationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  guestName?: string | null;

  @IsOptional()
  @IsString()
  guestPhone?: string | null;

  @IsOptional()
  @IsEmail()
  guestEmail?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  partySize?: number | null;

  @IsOptional()
  @IsUUID()
  tableId?: string | null;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  channel?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number | null;
}

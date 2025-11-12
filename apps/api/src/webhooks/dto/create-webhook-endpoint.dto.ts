import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ReservationWebhookEvent } from '../webhook.types';
import { ALL_RESERVATION_EVENTS } from '../webhook.events';

export class CreateWebhookEndpointDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl(
    {
      require_tld: false,
      protocols: ['http', 'https'],
      require_protocol: true,
    },
    { message: 'URL must be a valid http(s) address' },
  )
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_RESERVATION_EVENTS, { each: true })
  events?: ReservationWebhookEvent[];
}

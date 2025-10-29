import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWebhookEndpointDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'], require_protocol: true },
    { message: 'URL must be a valid http(s) address' },
  )
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

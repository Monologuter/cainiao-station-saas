import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShippingAddressDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone: string;

  @IsString()
  province: string;

  @IsString()
  city: string;

  @IsString()
  district: string;

  @IsString()
  address: string;
}

export class QuoteDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  sender: ShippingAddressDto;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  receiver: ShippingAddressDto;

  @IsInt()
  @Min(1)
  weightGram: number;

  @IsOptional()
  @IsIn(['balanced', 'priceFirst', 'speedFirst'])
  preference?: 'balanced' | 'priceFirst' | 'speedFirst';
}

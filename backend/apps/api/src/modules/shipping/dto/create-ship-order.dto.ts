import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ShippingAddressDto } from './quote.dto';

export class ShippingItemDto {
  @IsString()
  type: string;

  @IsInt()
  @Min(1)
  weightGram: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  declaredValue?: number;
}

export class CreateShipOrderDto {
  @IsIn(['STATION', 'ONLINE'])
  channel: 'STATION' | 'ONLINE';

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsString()
  courierCode: string;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  sender: ShippingAddressDto;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  receiver: ShippingAddressDto;

  @ValidateNested()
  @Type(() => ShippingItemDto)
  item: ShippingItemDto;
}

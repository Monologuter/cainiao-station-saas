import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ShippingAddressDto } from './quote.dto';
import { ShippingItemDto } from './create-ship-order.dto';

export class CreateConsumerShipOrderDto {
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

  @IsOptional()
  @IsUUID()
  couponId?: string;
}

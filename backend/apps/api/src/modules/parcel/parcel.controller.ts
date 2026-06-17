import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequirePermission } from '../identity/decorators';
import { ParcelService } from './parcel.service';

@Controller('parcels')
export class ParcelController {
  constructor(private readonly parcels: ParcelService) {}

  @RequirePermission('parcel:read')
  @Get()
  list(
    @Query('status') status?: string,
    @Query('phoneTail') phoneTail?: string,
    @Query('pickupCode') pickupCode?: string,
    @Query('slot') slot?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.parcels.list({
      status,
      phoneTail,
      pickupCode,
      slot,
      page,
      size,
    });
  }

  @RequirePermission('parcel:read')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.parcels.detail(id);
  }
}

import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../identity/decorators';
import { OverdueScanProcessor } from './overdue/overdue-scan.processor';
import { ParcelService } from './parcel.service';

@Controller('parcels')
export class ParcelController {
  constructor(
    private readonly parcels: ParcelService,
    private readonly overdueScan: OverdueScanProcessor,
  ) {}

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
  @Get('overdue')
  listOverdue(
    @Query('level') level?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.parcels.listOverdue({ level, page, size });
  }

  @RequirePermission('parcel:overdue:scan')
  @Post('overdue/scan')
  scanOverdue() {
    return this.overdueScan.runOverdueScan();
  }

  @RequirePermission('parcel:read')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.parcels.detail(id);
  }
}

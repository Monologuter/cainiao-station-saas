import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { LogisticsModule } from '../logistics/logistics.module';
import { PayModule } from '../pay/pay.module';
import { CourierSelectorService } from './courier-selector.service';
import { PricingService } from './pricing.service';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [LogisticsModule, PayModule],
  controllers: [ShippingController],
  providers: [
    ShippingService,
    PricingService,
    CourierSelectorService,
    PrismaService,
    TenantPrismaService,
  ],
  exports: [ShippingService, PricingService, CourierSelectorService],
})
export class ShippingModule {}

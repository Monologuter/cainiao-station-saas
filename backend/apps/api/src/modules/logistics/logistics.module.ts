import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { LOGISTICS_PROVIDER } from './logistics-provider.interface';
import { LogisticsService } from './logistics.service';
import { MockLogisticsProvider } from './mock-logistics.provider';

@Module({
  providers: [
    LogisticsService,
    PrismaService,
    TenantPrismaService,
    { provide: LOGISTICS_PROVIDER, useClass: MockLogisticsProvider },
  ],
  exports: [LogisticsService],
})
export class LogisticsModule {}

import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { MockPayChannel } from './mock-pay.channel';
import { PAY_CHANNEL } from './pay-channel.interface';
import { PayService } from './pay.service';

@Module({
  providers: [
    PayService,
    PrismaService,
    TenantPrismaService,
    { provide: PAY_CHANNEL, useClass: MockPayChannel },
  ],
  exports: [PayService],
})
export class PayModule {}

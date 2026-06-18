import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
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
    CircuitBreakerService,
    { provide: PAY_CHANNEL, useClass: MockPayChannel },
  ],
  exports: [PayService, PAY_CHANNEL],
})
export class PayModule {}

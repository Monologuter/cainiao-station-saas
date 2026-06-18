import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { AdminConfigModule } from '../config/admin-config.module';
import { MockPayChannel } from './mock-pay.channel';
import { PayChannelFactory } from './pay-channel.factory';
import { PAY_CHANNEL } from './pay-channel.interface';
import { PayController } from './pay.controller';
import { PayService } from './pay.service';
import { WechatPayChannel } from './wechat-pay.channel';

@Module({
  imports: [AdminConfigModule],
  controllers: [PayController],
  providers: [
    PayService,
    PayChannelFactory,
    MockPayChannel,
    WechatPayChannel,
    PrismaService,
    TenantPrismaService,
    CircuitBreakerService,
    {
      provide: PAY_CHANNEL,
      useFactory: (factory: PayChannelFactory) => factory.get(),
      inject: [PayChannelFactory],
    },
  ],
  exports: [PayService, PAY_CHANNEL],
})
export class PayModule {}

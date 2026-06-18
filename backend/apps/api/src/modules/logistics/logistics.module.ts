import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { AdminConfigModule } from '../config/admin-config.module';
import { KuaiDi100Provider } from './kuaidi100.provider';
import { LOGISTICS_PROVIDER } from './logistics-provider.interface';
import { LogisticsProviderFactory } from './logistics-provider.factory';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { MockLogisticsProvider } from './mock-logistics.provider';

@Module({
  imports: [AdminConfigModule],
  controllers: [LogisticsController],
  providers: [
    LogisticsService,
    LogisticsProviderFactory,
    KuaiDi100Provider,
    MockLogisticsProvider,
    PrismaService,
    TenantPrismaService,
    CircuitBreakerService,
    {
      provide: LOGISTICS_PROVIDER,
      useFactory: (factory: LogisticsProviderFactory) => factory.get(),
      inject: [LogisticsProviderFactory],
    },
  ],
  exports: [LogisticsService],
})
export class LogisticsModule {}

import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { PlanController } from './plan/plan.controller';
import { PlanService } from './plan/plan.service';
import { SubscriptionController } from './subscription/subscription.controller';
import { SubscriptionService } from './subscription/subscription.service';

@Module({
  controllers: [PlanController, SubscriptionController],
  providers: [
    PlanService,
    SubscriptionService,
    PrismaService,
    TenantPrismaService,
  ],
})
export class BillingModule {}

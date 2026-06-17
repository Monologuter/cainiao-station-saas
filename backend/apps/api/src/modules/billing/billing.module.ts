import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { InvoiceController } from './invoice/invoice.controller';
import { InvoiceService } from './invoice/invoice.service';
import { PlanController } from './plan/plan.controller';
import { PlanService } from './plan/plan.service';
import { SubscriptionController } from './subscription/subscription.controller';
import { SubscriptionService } from './subscription/subscription.service';
import { SmsUsageSubscriber } from './usage/subscribers/sms-usage.subscriber';
import { UsageController } from './usage/usage.controller';
import { UsageService } from './usage/usage.service';

@Module({
  controllers: [
    PlanController,
    SubscriptionController,
    UsageController,
    InvoiceController,
  ],
  providers: [
    PlanService,
    SubscriptionService,
    UsageService,
    InvoiceService,
    SmsUsageSubscriber,
    PrismaService,
    TenantPrismaService,
  ],
})
export class BillingModule {}

import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { RedisService } from '../../core/redis/redis.service';
import { ScheduledLockService } from '../../core/scheduler-lock/scheduler-lock.service';
import { PayModule } from '../pay/pay.module';
import { InvoiceController } from './invoice/invoice.controller';
import { InvoiceService } from './invoice/invoice.service';
import { ExpiryCheckProcessor } from './jobs/expiry-check.processor';
import { InvoiceRunProcessor } from './jobs/invoice-run.processor';
import { SubscriptionPayController } from './pay/subscription-pay.controller';
import { SubscriptionPayService } from './pay/subscription-pay.service';
import { PlanController } from './plan/plan.controller';
import { PlanService } from './plan/plan.service';
import { SubscriptionController } from './subscription/subscription.controller';
import { SubscriptionService } from './subscription/subscription.service';
import { SmsUsageSubscriber } from './usage/subscribers/sms-usage.subscriber';
import { UsageController } from './usage/usage.controller';
import { UsageService } from './usage/usage.service';

@Module({
  imports: [PayModule],
  controllers: [
    PlanController,
    SubscriptionController,
    UsageController,
    InvoiceController,
    SubscriptionPayController,
  ],
  providers: [
    PlanService,
    SubscriptionService,
    UsageService,
    InvoiceService,
    SubscriptionPayService,
    SmsUsageSubscriber,
    InvoiceRunProcessor,
    ExpiryCheckProcessor,
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
    ScheduledLockService,
  ],
  exports: [SubscriptionService, InvoiceRunProcessor, ExpiryCheckProcessor],
})
export class BillingModule {}

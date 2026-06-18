import { Module } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { AdminConfigModule } from '../config/admin-config.module';
import { InAppChannel } from './in-app.channel';
import { MockSmsChannel } from './mock-sms.channel';
import { NotifyService } from './notify.service';
import { OnboardingSubscriber } from './onboarding.subscriber';
import { OverdueSubscriber } from './overdue.subscriber';
import { ParcelStoredSubscriber } from './parcel-stored.subscriber';
import { TemplateRenderer } from './template-renderer';

@Module({
  imports: [AdminConfigModule],
  providers: [
    NotifyService,
    TemplateRenderer,
    InAppChannel,
    MockSmsChannel,
    ParcelStoredSubscriber,
    OverdueSubscriber,
    OnboardingSubscriber,
    PrismaService,
    TenantPrismaService,
    CircuitBreakerService,
  ],
  exports: [NotifyService],
})
export class NotifyModule {}

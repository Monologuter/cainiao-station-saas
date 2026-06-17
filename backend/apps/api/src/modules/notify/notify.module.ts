import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { InAppChannel } from './in-app.channel';
import { MockSmsChannel } from './mock-sms.channel';
import { NotifyService } from './notify.service';
import { OnboardingSubscriber } from './onboarding.subscriber';
import { OverdueSubscriber } from './overdue.subscriber';
import { ParcelStoredSubscriber } from './parcel-stored.subscriber';
import { TemplateRenderer } from './template-renderer';

@Module({
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
  ],
  exports: [NotifyService],
})
export class NotifyModule {}

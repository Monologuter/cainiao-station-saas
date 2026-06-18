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
import { SmsChannelFactory } from './sms-channel.factory';
import { TemplateRenderer } from './template-renderer';
import { TencentSmsChannel } from './tencent-sms.channel';
import { WechatSubscribeAuthService } from './wechat-subscribe-auth.service';
import { WechatSubscribeChannel } from './wechat-subscribe.channel';
import { WechatSubscribeChannelFactory } from './wechat-subscribe.factory';

@Module({
  imports: [AdminConfigModule],
  providers: [
    NotifyService,
    TemplateRenderer,
    InAppChannel,
    MockSmsChannel,
    TencentSmsChannel,
    SmsChannelFactory,
    WechatSubscribeAuthService,
    WechatSubscribeChannel,
    WechatSubscribeChannelFactory,
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

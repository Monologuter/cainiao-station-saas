import { Injectable } from '@nestjs/common';
import { EventBus } from '../../core/event-bus/event-bus';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ChannelResolver } from '../config/channel-resolver';
import { NotifyChannelType } from './notify-channel';
import { TemplateRenderer } from './template-renderer';

interface ParcelStoredNotification {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode: string;
  slotCode?: string;
}

interface ParcelOverdueNotification {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode?: string | null;
  slotCode?: string | null;
  level: 1 | 2 | 3;
  daysOverdue: number;
}

interface TenantApprovedNotification {
  applicationId: string;
  tenantId: string;
  stationId?: string;
  ownerUsername: string;
  tempPassword?: string;
  planCode: string;
}

interface ApplicationRejectedNotification {
  applicationId: string;
  contactPhone: string;
  rejectReason: string;
}

const OVERDUE_TEMPLATE_BY_LEVEL: Record<1 | 2 | 3, string> = {
  1: 'OVERDUE_REMIND',
  2: 'OVERDUE_URGE',
  3: 'OVERDUE_FINAL',
};

@Injectable()
export class NotifyService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly renderer: TemplateRenderer,
    private readonly eventBus: EventBus,
    private readonly channelResolver: ChannelResolver,
  ) {}

  async notifyParcelStored(payload: ParcelStoredNotification) {
    for (const channel of ['IN_APP', 'SMS'] as NotifyChannelType[]) {
      await this.ensureChannelReady(channel);
      const rendered = await this.renderer.render('PARCEL_STORED', channel, {
        code: payload.pickupCode,
        slot: payload.slotCode ?? '',
        station: payload.stationName ?? payload.stationId,
        tail: payload.receiverPhone.slice(-4),
      });
      const dedupKey = `${payload.parcelId}:ParcelStored:${channel}`;

      const notification = await this.tenantPrisma.withTenant<any>((tx) =>
        tx.notification.upsert({
          where: {
            tenantId_dedupKey: {
              tenantId: payload.tenantId,
              dedupKey,
            },
          },
          update: {},
          create: {
            tenantId: payload.tenantId,
            parcelId: payload.parcelId,
            receiverPhone: payload.receiverPhone,
            channel,
            templateCode: 'PARCEL_STORED',
            content: rendered.content,
            status: 'SENT',
            dedupKey,
            sentAt: new Date(),
          },
        }),
      );
      await this.publishSmsSent(
        channel,
        payload,
        dedupKey,
        notification.sentAt,
      );
    }
  }

  async notifyParcelOverdue(payload: ParcelOverdueNotification) {
    const templateCode = OVERDUE_TEMPLATE_BY_LEVEL[payload.level];
    for (const channel of ['IN_APP', 'SMS'] as NotifyChannelType[]) {
      await this.ensureChannelReady(channel);
      const rendered = await this.renderer.render(templateCode, channel, {
        code: payload.pickupCode ?? '',
        slot: payload.slotCode ?? '',
        station: payload.stationName ?? payload.stationId,
        daysOverdue: String(payload.daysOverdue),
      });
      const dedupKey = `${payload.parcelId}:ParcelOverdue:${payload.level}:${channel}`;

      const notification = await this.tenantPrisma.withTenant<any>((tx) =>
        tx.notification.upsert({
          where: {
            tenantId_dedupKey: {
              tenantId: payload.tenantId,
              dedupKey,
            },
          },
          update: {},
          create: {
            tenantId: payload.tenantId,
            parcelId: payload.parcelId,
            receiverPhone: payload.receiverPhone,
            channel,
            templateCode,
            content: rendered.content,
            status: 'SENT',
            dedupKey,
            sentAt: new Date(),
          },
        }),
      );
      await this.publishSmsSent(
        channel,
        payload,
        dedupKey,
        notification.sentAt,
      );
    }
  }

  async notifyTenantApproved(payload: TenantApprovedNotification) {
    for (const channel of ['IN_APP', 'SMS'] as NotifyChannelType[]) {
      await this.ensureChannelReady(channel);
      const rendered = await this.renderer.render('TENANT_APPROVED', channel, {
        username: payload.ownerUsername,
        tempPassword: payload.tempPassword ?? '',
        planCode: payload.planCode,
      });
      const dedupKey = `${payload.applicationId}:TenantApproved:${channel}`;

      const notification = await this.tenantPrisma.withTenant<any>((tx) =>
        tx.notification.upsert({
          where: {
            tenantId_dedupKey: {
              tenantId: payload.tenantId,
              dedupKey,
            },
          },
          update: {},
          create: {
            tenantId: payload.tenantId,
            parcelId: null,
            receiverPhone: payload.ownerUsername,
            channel,
            templateCode: 'TENANT_APPROVED',
            content: rendered.content,
            status: 'SENT',
            dedupKey,
            sentAt: new Date(),
          },
        }),
      );
      await this.publishSmsSent(
        channel,
        {
          tenantId: payload.tenantId,
          stationId: payload.stationId ?? '',
        },
        dedupKey,
        notification.sentAt,
      );
    }
  }

  async notifyApplicationRejected(payload: ApplicationRejectedNotification) {
    await this.ensureChannelReady('SMS');
    const rendered = await this.renderer.render('APPLICATION_REJECTED', 'SMS', {
      reason: payload.rejectReason,
    });
    return [
      {
        channel: 'SMS',
        receiverPhone: payload.contactPhone,
        content: rendered.content,
      },
    ];
  }

  private async ensureChannelReady(channel: NotifyChannelType) {
    if (channel === 'SMS') {
      await this.channelResolver.resolve('sms');
    }
  }

  private async publishSmsSent(
    channel: NotifyChannelType,
    payload: { tenantId: string; stationId: string },
    dedupKey: string,
    sentAt?: Date | null,
  ) {
    if (channel !== 'SMS') {
      return;
    }
    await this.eventBus.publish(
      EventBus.createEvent('SmsNotificationSent', {
        tenantId: payload.tenantId,
        stationId: payload.stationId,
        usageEventId: `notify:${payload.tenantId}:${dedupKey}`,
        sentAt: (sentAt ?? new Date()).toISOString(),
      }),
    );
  }
}

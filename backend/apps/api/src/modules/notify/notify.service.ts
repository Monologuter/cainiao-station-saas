import { Injectable, Optional } from '@nestjs/common';
import { EventBus } from '../../core/event-bus/event-bus';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ChannelResolver } from '../config/channel-resolver';
import { NotifyChannelType } from './notify-channel';
import { SmsChannelFactory } from './sms-channel.factory';
import { TemplateRenderer } from './template-renderer';
import { WechatSubscribeChannelFactory } from './wechat-subscribe.factory';

interface ParcelStoredNotification {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode: string;
  slotCode?: string;
  consumerId?: string | null;
}

interface ParcelOverdueNotification {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode?: string | null;
  slotCode?: string | null;
  consumerId?: string | null;
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
const ADAPTER_BREAKER_OPTIONS = {
  failureThreshold: 3,
  coolDownMs: 30_000,
  timeoutMs: 3000,
};

@Injectable()
export class NotifyService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly renderer: TemplateRenderer,
    private readonly eventBus: EventBus,
    private readonly channelResolver: ChannelResolver,
    @Optional() private readonly breaker?: CircuitBreakerService,
    @Optional() private readonly smsFactory?: SmsChannelFactory,
    @Optional() private readonly wechatFactory?: WechatSubscribeChannelFactory,
  ) {}

  async notifyParcelStored(payload: ParcelStoredNotification) {
    for (const channel of this.channelsFor(payload)) {
      const dedupKey = `${payload.parcelId}:ParcelStored:${channel}`;
      if (await this.notificationExists(payload.tenantId, dedupKey)) {
        continue;
      }
      await this.ensureChannelReady(channel);
      const variables = [
        payload.pickupCode,
        payload.slotCode ?? '',
        payload.stationName ?? payload.stationId,
        payload.receiverPhone.slice(-4),
      ];
      const rendered = await this.renderer.render('PARCEL_STORED', channel, {
        code: variables[0],
        slot: variables[1],
        station: variables[2],
        tail: variables[3],
      });
      const notification = await this.createNotificationOnce({
        tenantId: payload.tenantId,
        parcelId: payload.parcelId,
        receiverPhone: payload.receiverPhone,
        channel,
        templateCode: 'PARCEL_STORED',
        content: rendered.content,
        status: 'SENT',
        dedupKey,
        sentAt: new Date(),
      });
      if (!notification.created) {
        continue;
      }
      await this.publishSmsSent(
        channel,
        payload,
        dedupKey,
        notification.row.sentAt,
        await this.sendChannelIfNeeded(
          channel,
          rendered.content,
          payload.receiverPhone,
          payload,
          'PARCEL_STORED',
          variables,
        ),
      );
    }
  }

  async notifyParcelOverdue(payload: ParcelOverdueNotification) {
    const templateCode = OVERDUE_TEMPLATE_BY_LEVEL[payload.level];
    for (const channel of this.channelsFor(payload)) {
      const dedupKey = `${payload.parcelId}:ParcelOverdue:${payload.level}:${channel}`;
      if (await this.notificationExists(payload.tenantId, dedupKey)) {
        continue;
      }
      await this.ensureChannelReady(channel);
      const variables = [
        payload.pickupCode ?? '',
        payload.slotCode ?? '',
        payload.stationName ?? payload.stationId,
        String(payload.daysOverdue),
      ];
      const rendered = await this.renderer.render(templateCode, channel, {
        code: variables[0],
        slot: variables[1],
        station: variables[2],
        daysOverdue: variables[3],
      });
      const notification = await this.createNotificationOnce({
        tenantId: payload.tenantId,
        parcelId: payload.parcelId,
        receiverPhone: payload.receiverPhone,
        channel,
        templateCode,
        content: rendered.content,
        status: 'SENT',
        dedupKey,
        sentAt: new Date(),
      });
      if (!notification.created) {
        continue;
      }
      await this.publishSmsSent(
        channel,
        payload,
        dedupKey,
        notification.row.sentAt,
        await this.sendChannelIfNeeded(
          channel,
          rendered.content,
          payload.receiverPhone,
          payload,
          templateCode,
          variables,
        ),
      );
    }
  }

  async notifyTenantApproved(payload: TenantApprovedNotification) {
    for (const channel of ['IN_APP', 'SMS'] as NotifyChannelType[]) {
      const dedupKey = `${payload.applicationId}:TenantApproved:${channel}`;
      if (await this.notificationExists(payload.tenantId, dedupKey)) {
        continue;
      }
      await this.ensureChannelReady(channel);
      const rendered = await this.renderer.render('TENANT_APPROVED', channel, {
        username: payload.ownerUsername,
        tempPassword: payload.tempPassword ?? '',
        planCode: payload.planCode,
      });
      const notification = await this.createNotificationOnce({
        tenantId: payload.tenantId,
        parcelId: null,
        receiverPhone: payload.ownerUsername,
        channel,
        templateCode: 'TENANT_APPROVED',
        content: rendered.content,
        status: 'SENT',
        dedupKey,
        sentAt: new Date(),
      });
      if (!notification.created) {
        continue;
      }
      await this.publishSmsSent(
        channel,
        {
          tenantId: payload.tenantId,
          stationId: payload.stationId ?? '',
        },
        dedupKey,
        notification.row.sentAt,
        await this.sendChannelIfNeeded(
          channel,
          rendered.content,
          payload.ownerUsername,
          { ...payload, consumerId: undefined },
          'TENANT_APPROVED',
          [payload.ownerUsername, payload.tempPassword ?? '', payload.planCode],
        ),
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
      await this.withBreaker(
        'notify.sms',
        () => this.channelResolver.resolve('sms'),
        async () => undefined,
      );
    }
    if (channel === 'WECHAT') {
      await this.withBreaker(
        'notify.wechat',
        () => this.channelResolver.resolve('wechat'),
        async () => undefined,
      );
    }
  }

  private withBreaker<T>(
    name: string,
    action: () => Promise<T>,
    fallback: () => Promise<T> | T,
  ) {
    if (!this.breaker) return action();
    return this.breaker.execute(
      name,
      ADAPTER_BREAKER_OPTIONS,
      action,
      fallback,
    );
  }

  private async publishSmsSent(
    channel: NotifyChannelType,
    payload: { tenantId: string; stationId: string },
    dedupKey: string,
    sentAt?: Date | null,
    quantity = 1,
  ) {
    if (channel !== 'SMS' || quantity <= 0) {
      return;
    }
    await this.eventBus.publish(
      EventBus.createEvent('SmsNotificationSent', {
        tenantId: payload.tenantId,
        stationId: payload.stationId,
        usageEventId: `notify:${payload.tenantId}:${dedupKey}`,
        quantity,
        sentAt: (sentAt ?? new Date()).toISOString(),
      }),
    );
  }

  private channelsFor(payload: { consumerId?: string | null }) {
    const channels: NotifyChannelType[] = ['IN_APP'];
    if (payload.consumerId) {
      channels.push('WECHAT');
    }
    channels.push('SMS');
    return channels;
  }

  private async notificationExists(tenantId: string, dedupKey: string) {
    return this.tenantPrisma.withTenant<boolean>(async (tx) => {
      if (!tx.notification.findUnique) {
        return false;
      }
      const existing = await tx.notification.findUnique({
        where: {
          tenantId_dedupKey: { tenantId, dedupKey },
        },
      });
      return !!existing;
    });
  }

  private async createNotificationOnce(create: any) {
    return this.tenantPrisma.withTenant<{
      created: boolean;
      row: any;
    }>(async (tx) => {
      if (!tx.notification.create) {
        const row = await tx.notification.upsert({
          where: {
            tenantId_dedupKey: {
              tenantId: create.tenantId,
              dedupKey: create.dedupKey,
            },
          },
          update: {},
          create,
        });
        return { created: true, row };
      }
      try {
        const row = await tx.notification.create({ data: create });
        return { created: true, row };
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          throw error;
        }
        const row = await tx.notification.findUnique({
          where: {
            tenantId_dedupKey: {
              tenantId: create.tenantId,
              dedupKey: create.dedupKey,
            },
          },
        });
        return { created: false, row };
      }
    });
  }

  private async sendChannelIfNeeded(
    channel: NotifyChannelType,
    content: string,
    receiverPhone: string,
    payload: { tenantId: string; consumerId?: string | null },
    templateCode: string,
    variables: string[],
  ) {
    if (channel === 'WECHAT') {
      if (!payload.consumerId || !this.wechatFactory) {
        return 0;
      }
      const wechatChannel = await this.wechatFactory.get();
      const result = await wechatChannel.send({
        channel: 'WECHAT',
        content,
        tenantId: payload.tenantId,
        consumerId: payload.consumerId,
        templateCode,
        variables,
      });
      if (!result.ok && result.retryable) {
        throw new Error(result.error ?? 'wechat notify failed');
      }
      return result.ok ? 1 : 0;
    }
    if (channel !== 'SMS' || !this.smsFactory) {
      return 1;
    }
    const smsChannel = await this.smsFactory.get();
    const result = await smsChannel.send({
      channel: 'SMS',
      content,
      receiverPhone,
      templateCode,
      variables,
    });
    return result.ok ? (result.billingUnits ?? 1) : 0;
  }
}

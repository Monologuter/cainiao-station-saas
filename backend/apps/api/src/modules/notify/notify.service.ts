import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
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
  ) {}

  async notifyParcelStored(payload: ParcelStoredNotification) {
    for (const channel of ['IN_APP', 'SMS'] as NotifyChannelType[]) {
      const rendered = await this.renderer.render('PARCEL_STORED', channel, {
        code: payload.pickupCode,
        slot: payload.slotCode ?? '',
        station: payload.stationName ?? payload.stationId,
        tail: payload.receiverPhone.slice(-4),
      });
      const dedupKey = `${payload.parcelId}:ParcelStored:${channel}`;

      await this.tenantPrisma.withTenant((tx) =>
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
    }
  }

  async notifyParcelOverdue(payload: ParcelOverdueNotification) {
    const templateCode = OVERDUE_TEMPLATE_BY_LEVEL[payload.level];
    for (const channel of ['IN_APP', 'SMS'] as NotifyChannelType[]) {
      const rendered = await this.renderer.render(templateCode, channel, {
        code: payload.pickupCode ?? '',
        slot: payload.slotCode ?? '',
        station: payload.stationName ?? payload.stationId,
        daysOverdue: String(payload.daysOverdue),
      });
      const dedupKey = `${payload.parcelId}:ParcelOverdue:${payload.level}:${channel}`;

      await this.tenantPrisma.withTenant((tx) =>
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
    }
  }
}

import { NotifyService } from './notify.service';
import { TemplateRenderer } from './template-renderer';

describe('TemplateRenderer', () => {
  it('falls back from tenant template to platform default', async () => {
    const tx = {
      notifyTemplate: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          content: '取件码{code}，库位{slot}',
        }),
      },
    };
    const renderer = new TemplateRenderer({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await expect(
      renderer.render('PARCEL_STORED', 'SMS', {
        code: '1234',
        slot: 'A-01',
      }),
    ).resolves.toEqual({ content: '取件码1234，库位A-01' });
  });
});

describe('NotifyService', () => {
  const channelResolver = {
    resolve: jest.fn().mockResolvedValue({ channel: 'sms', provider: 'mock' }),
  };

  beforeEach(() => {
    channelResolver.resolve.mockClear();
  });

  it('creates IN_APP and SMS notification records for ParcelStored', async () => {
    const created: any[] = [];
    const tx = {
      notification: {
        upsert: async ({ create }: any) => {
          created.push(create);
          return create;
        },
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const renderer = {
      render: jest.fn(async (_code, channel, vars) => ({
        content: `${channel}:${vars.code}:${vars.slot}`,
      })),
    } as any;
    const eventBus = { publish: jest.fn() };
    const service = new NotifyService(
      tenantPrisma,
      renderer,
      eventBus as any,
      channelResolver as any,
    );

    await service.notifyParcelStored({
      parcelId: 'p1',
      tenantId: 't1',
      stationId: 's1',
      stationName: '城南驿站',
      receiverPhone: '13800000000',
      pickupCode: '1234',
      slotCode: 'A-01',
    });

    expect(created.map((item) => item.channel)).toEqual(['IN_APP', 'SMS']);
    expect(created[0]).toMatchObject({
      tenantId: 't1',
      parcelId: 'p1',
      receiverPhone: '13800000000',
      templateCode: 'PARCEL_STORED',
      status: 'SENT',
      dedupKey: 'p1:ParcelStored:IN_APP',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SmsNotificationSent',
        payload: expect.objectContaining({
          tenantId: 't1',
          stationId: 's1',
          usageEventId: 'notify:t1:p1:ParcelStored:SMS',
        }),
      }),
    );
    expect(channelResolver.resolve).toHaveBeenCalledWith('sms');
  });

  it('sends SMS through selected channel and publishes real billing units', async () => {
    const tx = {
      notification: {
        upsert: jest.fn(async ({ create }: any) => create),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const renderer = {
      render: jest.fn(async (_code, channel, vars) => ({
        content: `${channel}:${vars.code}:${vars.slot}`,
      })),
    } as any;
    const eventBus = { publish: jest.fn() };
    const smsChannel = {
      send: jest.fn().mockResolvedValue({ ok: true, billingUnits: 2 }),
    };
    const service = new NotifyService(
      tenantPrisma,
      renderer,
      eventBus as any,
      channelResolver as any,
      undefined,
      { get: jest.fn().mockResolvedValue(smsChannel) } as any,
    );

    await service.notifyParcelStored({
      parcelId: 'p1',
      tenantId: 't1',
      stationId: 's1',
      stationName: '城南驿站',
      receiverPhone: '13800000000',
      pickupCode: '1234',
      slotCode: 'A-01',
    });

    expect(smsChannel.send).toHaveBeenCalledWith({
      channel: 'SMS',
      content: 'SMS:1234:A-01',
      receiverPhone: '13800000000',
      templateCode: 'PARCEL_STORED',
      variables: ['1234', 'A-01', '城南驿站', '0000'],
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SmsNotificationSent',
        payload: expect.objectContaining({
          quantity: 2,
        }),
      }),
    );
  });

  it('routes consumer-bound parcel notifications through WeChat before SMS', async () => {
    const created: any[] = [];
    const tx = {
      notification: {
        upsert: jest.fn(async ({ create }: any) => {
          created.push(create);
          return create;
        }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const renderer = {
      render: jest.fn(async (_code, channel, vars) => ({
        content: `${channel}:${vars.code}:${vars.slot}`,
      })),
    } as any;
    const eventBus = { publish: jest.fn() };
    const wechatChannel = {
      send: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new NotifyService(
      tenantPrisma,
      renderer,
      eventBus as any,
      channelResolver as any,
      undefined,
      undefined,
      { get: jest.fn().mockResolvedValue(wechatChannel) } as any,
    );

    await service.notifyParcelStored({
      parcelId: 'p1',
      tenantId: 't1',
      stationId: 's1',
      receiverPhone: '13800000000',
      pickupCode: '1234',
      slotCode: 'A-01',
      consumerId: 'c1',
    });

    expect(created.map((item) => item.channel)).toEqual([
      'IN_APP',
      'WECHAT',
      'SMS',
    ]);
    expect(wechatChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'WECHAT',
        tenantId: 't1',
        consumerId: 'c1',
        templateCode: 'PARCEL_STORED',
        variables: ['1234', 'A-01', 's1', '0000'],
      }),
    );
  });

  it('dedups repeated ParcelStored notifications by dedup key', async () => {
    const upserts: any[] = [];
    const tx = {
      notification: {
        upsert: async (args: any) => {
          upserts.push(args);
          return args.create;
        },
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const renderer = {
      render: jest.fn(async () => ({ content: 'ok' })),
    } as any;
    const service = new NotifyService(
      tenantPrisma,
      renderer,
      {
        publish: jest.fn(),
      } as any,
      channelResolver as any,
    );

    await service.notifyParcelStored({
      parcelId: 'p1',
      tenantId: 't1',
      stationId: 's1',
      receiverPhone: '13800000000',
      pickupCode: '1234',
      slotCode: 'A-01',
    });

    expect(upserts[0].where).toEqual({
      tenantId_dedupKey: {
        tenantId: 't1',
        dedupKey: 'p1:ParcelStored:IN_APP',
      },
    });
    expect(upserts[0].update).toEqual({});
  });

  it('creates level-specific overdue notifications with parcel-level dedup', async () => {
    const upserts: any[] = [];
    const tx = {
      notification: {
        upsert: async (args: any) => {
          upserts.push(args);
          return args.create;
        },
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const renderer = {
      render: jest.fn(async (code, channel, vars) => ({
        content: `${code}:${channel}:${vars.daysOverdue}`,
      })),
    } as any;
    const service = new NotifyService(
      tenantPrisma,
      renderer,
      {
        publish: jest.fn(),
      } as any,
      channelResolver as any,
    );

    await service.notifyParcelOverdue({
      parcelId: 'p1',
      tenantId: 't1',
      stationId: 's1',
      receiverPhone: '13800000000',
      pickupCode: '1234',
      slotCode: 'A-01',
      level: 2,
      daysOverdue: 7,
    });

    expect(renderer.render).toHaveBeenCalledWith('OVERDUE_URGE', 'IN_APP', {
      code: '1234',
      slot: 'A-01',
      station: 's1',
      daysOverdue: '7',
    });
    expect(upserts).toHaveLength(2);
    expect(upserts[0].where).toEqual({
      tenantId_dedupKey: {
        tenantId: 't1',
        dedupKey: 'p1:ParcelOverdue:2:IN_APP',
      },
    });
    expect(upserts[0].create).toMatchObject({
      tenantId: 't1',
      parcelId: 'p1',
      receiverPhone: '13800000000',
      templateCode: 'OVERDUE_URGE',
      status: 'SENT',
      dedupKey: 'p1:ParcelOverdue:2:IN_APP',
    });
  });

  it('creates tenant-scoped onboarding approval notifications and meters SMS usage', async () => {
    const upserts: any[] = [];
    const tx = {
      notification: {
        upsert: async (args: any) => {
          upserts.push(args);
          return args.create;
        },
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const renderer = {
      render: jest.fn(async (code, channel, vars) => ({
        content: `${code}:${channel}:${vars.username}:${vars.tempPassword}`,
      })),
    } as any;
    const eventBus = { publish: jest.fn() };
    const service = new NotifyService(
      tenantPrisma,
      renderer,
      eventBus as any,
      channelResolver as any,
    );

    await service.notifyTenantApproved({
      applicationId: 'app-1',
      tenantId: 'tenant-1',
      stationId: 'station-1',
      ownerUsername: '13800000001',
      tempPassword: 'Cn123456',
      planCode: 'BASIC',
    });

    expect(upserts).toHaveLength(2);
    expect(upserts[0].create).toMatchObject({
      tenantId: 'tenant-1',
      receiverPhone: '13800000001',
      templateCode: 'TENANT_APPROVED',
      dedupKey: 'app-1:TenantApproved:IN_APP',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SmsNotificationSent',
        payload: expect.objectContaining({
          tenantId: 'tenant-1',
          stationId: 'station-1',
          usageEventId: 'notify:tenant-1:app-1:TenantApproved:SMS',
        }),
      }),
    );
  });

  it('renders rejected onboarding notifications without tenant-scoped persistence', async () => {
    const tx = {
      notification: {
        upsert: jest.fn(),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const renderer = {
      render: jest.fn(async (code, channel, vars) => ({
        content: `${code}:${channel}:${vars.reason}`,
      })),
    } as any;
    const service = new NotifyService(
      tenantPrisma,
      renderer,
      {
        publish: jest.fn(),
      } as any,
      channelResolver as any,
    );

    await expect(
      service.notifyApplicationRejected({
        applicationId: 'app-2',
        contactPhone: '13800000002',
        rejectReason: '证照不清晰',
      }),
    ).resolves.toEqual([
      {
        channel: 'SMS',
        receiverPhone: '13800000002',
        content: 'APPLICATION_REJECTED:SMS:证照不清晰',
      },
    ]);
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });
});

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
    const service = new NotifyService(tenantPrisma, renderer);

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
    const service = new NotifyService(tenantPrisma, renderer);

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
    const service = new NotifyService(tenantPrisma, renderer);

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
});

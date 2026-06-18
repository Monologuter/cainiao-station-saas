import { QueryMyParcelsTool } from './query-my-parcels.tool';

describe('QueryMyParcelsTool', () => {
  it('uses the trusted assistant context and masks receiver phone', async () => {
    const parcels = {
      listForAssistantTool: jest.fn().mockResolvedValue([
        {
          id: 'parcel-1',
          waybillNo: 'YT1234567890',
          carrier: '圆通',
          status: 'STORED',
          pickupCode: 'A123',
          receiverPhone: '13800001234',
          storedAt: new Date('2026-06-18T10:00:00.000Z'),
          station: { id: 'station-1', name: '城南驿站', code: 'ST01' },
          slot: { id: 'slot-1', code: 'A-01' },
        },
      ]),
    };
    const tool = new QueryMyParcelsTool(parcels as any);

    const result = await tool.execute(
      {
        tenantId: 'evil-tenant',
        phone: '13999999999',
        receiverPhone: '13999999999',
      },
      {
        tenantId: 'tenant-1',
        actorType: 'CONSUMER',
        channel: 'USER_APP',
        consumerId: 'consumer-1',
        verifiedPhone: '13800001234',
      },
    );

    expect(parcels.listForAssistantTool).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      receiverPhone: '13800001234',
      status: 'STORED',
      limit: 10,
    });
    expect(result.isError).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'parcel-1',
      receiverPhoneMasked: '138****1234',
      pickupCode: 'A123',
      stationName: '城南驿站',
      slotCode: 'A-01',
    });
    expect(JSON.stringify(result)).not.toContain('13800001234');
    expect(JSON.stringify(result)).not.toContain('13999999999');
  });
});

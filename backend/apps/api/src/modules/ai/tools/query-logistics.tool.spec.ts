import { QueryLogisticsTool } from './query-logistics.tool';

describe('QueryLogisticsTool', () => {
  it('rejects parcel logistics queries that are not owned by the verified phone', async () => {
    const parcels = {
      getAssistantOwnedParcel: jest.fn().mockResolvedValue(null),
    };
    const shipping = { getConsumerOrder: jest.fn() };
    const logistics = { getTracks: jest.fn() };
    const tool = new QueryLogisticsTool(
      parcels as any,
      shipping as any,
      logistics as any,
    );

    const result = await tool.execute(
      { parcelId: 'parcel-owned-by-other-phone', phone: '13999999999' },
      {
        tenantId: 'tenant-1',
        actorType: 'CONSUMER',
        channel: 'USER_APP',
        consumerId: 'consumer-1',
        verifiedPhone: '13800001234',
      },
    );

    expect(parcels.getAssistantOwnedParcel).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      parcelId: 'parcel-owned-by-other-phone',
      receiverPhone: '13800001234',
    });
    expect(logistics.getTracks).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isError: true,
      code: 'NOT_OWNED',
    });
  });

  it('rejects ship order logistics queries that are not owned by the consumer', async () => {
    const parcels = { getAssistantOwnedParcel: jest.fn() };
    const shipping = {
      getConsumerOrder: jest.fn().mockResolvedValue(null),
    };
    const logistics = { getTracks: jest.fn() };
    const tool = new QueryLogisticsTool(
      parcels as any,
      shipping as any,
      logistics as any,
    );

    const result = await tool.execute(
      { shipOrderId: 'order-owned-by-other-user', consumerId: 'evil' },
      {
        tenantId: 'tenant-1',
        actorType: 'CONSUMER',
        channel: 'USER_APP',
        consumerId: 'consumer-1',
        verifiedPhone: '13800001234',
      },
    );

    expect(shipping.getConsumerOrder).toHaveBeenCalledWith(
      'order-owned-by-other-user',
      { sub: 'consumer-1' },
    );
    expect(logistics.getTracks).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isError: true,
      code: 'NOT_OWNED',
    });
  });
});

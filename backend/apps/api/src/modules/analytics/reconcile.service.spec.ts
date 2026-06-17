import { ReconcileService } from './reconcile.service';

describe('ReconcileService', () => {
  it('recomputes daily metrics from detail tables and upserts metric_daily', async () => {
    const tx = {
      parcel: { count: jest.fn() },
      shipOrder: { count: jest.fn(), aggregate: jest.fn() },
      metricDaily: { upsert: jest.fn() },
    };
    tx.parcel.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);
    tx.shipOrder.count.mockResolvedValue(3);
    tx.shipOrder.aggregate.mockResolvedValue({ _sum: { quoteAmount: 4500 } });
    const service = new ReconcileService({
      withTenant: (fn: any) => fn(tx),
    } as any);

    await service.recomputeDay({
      tenantId: 't1',
      stationId: 's1',
      date: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(tx.metricDaily.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metric: 'inbound',
          value: BigInt(2),
        }),
      }),
    );
    expect(tx.metricDaily.upsert).toHaveBeenCalledTimes(6);
  });
});

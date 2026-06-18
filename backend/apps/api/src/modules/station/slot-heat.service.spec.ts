import { SlotHeatService } from './slot-heat.service';

describe('SlotHeatService', () => {
  it('creates daily heat when a slot is picked up for the first time', async () => {
    const tx = {
      slotHeatDaily: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'heat-1' }),
        update: jest.fn(),
      },
    };
    const tenantPrisma = { withTenant: jest.fn((fn) => fn(tx)) };
    const service = new SlotHeatService(tenantPrisma as any);

    await service.recordPickup({
      tenantId: 'tenant-1',
      stationId: 'station-1',
      slotId: 'slot-1',
      storedAt: new Date('2026-06-18T08:00:00.000Z'),
      pickedUpAt: new Date('2026-06-18T10:30:00.000Z'),
    });

    expect(tx.slotHeatDaily.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        stationId: 'station-1',
        slotId: 'slot-1',
        statDate: new Date('2026-06-18T00:00:00.000Z'),
        pickCount: 1,
        storeCount: 0,
        avgDwellMinutes: 150,
      }),
    });
    const histogram =
      tx.slotHeatDaily.create.mock.calls[0][0].data.hourHistogram;
    expect(histogram[10]).toBe(1);
  });

  it('increments existing heat and keeps a rolling average dwell time', async () => {
    const existing = {
      id: 'heat-1',
      pickCount: 2,
      storeCount: 0,
      avgDwellMinutes: 60,
      hourHistogram: Array(24).fill(0),
    };
    existing.hourHistogram[9] = 2;
    const tx = {
      slotHeatDaily: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'heat-1' }),
      },
    };
    const service = new SlotHeatService({
      withTenant: jest.fn((fn) => fn(tx)),
    } as any);

    await service.recordPickup({
      tenantId: 'tenant-1',
      stationId: 'station-1',
      slotId: 'slot-1',
      storedAt: new Date('2026-06-18T08:00:00.000Z'),
      pickedUpAt: new Date('2026-06-18T10:00:00.000Z'),
    });

    expect(tx.slotHeatDaily.update).toHaveBeenCalledWith({
      where: { id: 'heat-1' },
      data: expect.objectContaining({
        pickCount: 3,
        avgDwellMinutes: 80,
      }),
    });
    const histogram =
      tx.slotHeatDaily.update.mock.calls[0][0].data.hourHistogram;
    expect(histogram[9]).toBe(2);
    expect(histogram[10]).toBe(1);
  });

  it('returns heatmap rows with slot code for a station date', async () => {
    const tx = {
      slotHeatDaily: {
        findMany: jest.fn().mockResolvedValue([
          {
            slotId: 'slot-1',
            pickCount: 4,
            storeCount: 1,
            avgDwellMinutes: 50,
            hourHistogram: Array(24).fill(0),
            slot: { id: 'slot-1', code: 'A-01' },
          },
        ]),
      },
    };
    const service = new SlotHeatService({
      withTenant: jest.fn((fn) => fn(tx)),
    } as any);

    await expect(service.heatmap('station-1', '2026-06-18')).resolves.toEqual([
      {
        slotId: 'slot-1',
        slotCode: 'A-01',
        pickCount: 4,
        storeCount: 1,
        avgDwellMinutes: 50,
        hourHistogram: Array(24).fill(0),
      },
    ]);
  });
});

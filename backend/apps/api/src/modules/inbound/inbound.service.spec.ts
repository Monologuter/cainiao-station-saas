import { InboundService } from './inbound.service';

describe('InboundService', () => {
  it('creates parcel, allocates slot, generates pickup code and marks STORED', async () => {
    const parcelService = {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      markStored: jest.fn().mockResolvedValue({
        id: 'p1',
        status: 'STORED',
        pickupCode: '1234',
        slotId: 'slot1',
      }),
    };
    const allocator = {
      allocate: jest.fn().mockResolvedValue({ id: 'slot1', code: 'A-01' }),
    };
    const pickupCodes = { generate: jest.fn().mockResolvedValue('1234') };
    const prisma = {
      withTenant: jest.fn(async (fn) =>
        fn({
          parcel: { findFirst: jest.fn().mockResolvedValue(null) },
          slot: { findUnique: jest.fn().mockResolvedValue({ code: 'A-01' }) },
        }),
      ),
    };
    const service = new InboundService(
      prisma as any,
      parcelService as any,
      allocator as any,
      pickupCodes as any,
    );

    const out = await service.inbound({
      stationId: 's1',
      waybillNo: 'YT001',
      carrier: 'YTO',
      receiverPhone: '13800000000',
    });

    expect(parcelService.create).toHaveBeenCalledWith({
      stationId: 's1',
      waybillNo: 'YT001',
      carrier: 'YTO',
      receiverPhone: '13800000000',
    });
    expect(allocator.allocate).toHaveBeenCalledWith('s1', 'p1');
    expect(pickupCodes.generate).toHaveBeenCalledWith('s1');
    expect(parcelService.markStored).toHaveBeenCalledWith('p1', {
      pickupCode: '1234',
      slotId: 'slot1',
    });
    expect(out).toEqual({
      parcelId: 'p1',
      pickupCode: '1234',
      slotCode: 'A-01',
      status: 'STORED',
    });
  });

  it('returns existing STORED/PENDING parcel for duplicate waybill in same station', async () => {
    const existing = {
      id: 'p1',
      pickupCode: '1234',
      status: 'STORED',
      slot: { code: 'A-01' },
    };
    const prisma = {
      withTenant: jest.fn(async (fn) =>
        fn({ parcel: { findFirst: jest.fn().mockResolvedValue(existing) } }),
      ),
    };
    const parcelService = { create: jest.fn(), markStored: jest.fn() };
    const service = new InboundService(
      prisma as any,
      parcelService as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.inbound({
        stationId: 's1',
        waybillNo: 'YT001',
        receiverPhone: '13800000000',
      }),
    ).resolves.toEqual({
      parcelId: 'p1',
      pickupCode: '1234',
      slotCode: 'A-01',
      status: 'STORED',
    });
    expect(parcelService.create).not.toHaveBeenCalled();
  });
});

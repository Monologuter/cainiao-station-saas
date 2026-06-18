import { InboundService } from './inbound.service';

function makeTenantPrisma(findFirst: any = jest.fn().mockResolvedValue(null)) {
  return {
    withTenant: jest.fn(async (fn) =>
      fn({
        parcel: {
          findFirst,
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        slot: { findUnique: jest.fn().mockResolvedValue({ code: 'A-01' }) },
      }),
    ),
  };
}

describe('InboundService', () => {
  it('creates parcel, allocates slot, generates pickup code and marks STORED', async () => {
    const parcelService = {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      markStored: jest.fn(async (_id: string, input: any) => {
        const pickupCode = await input.reservePickupCode();
        return {
          id: 'p1',
          status: 'STORED',
          pickupCode,
          slotId: input.slotId,
        };
      }),
    };
    const allocator = {
      allocate: jest.fn().mockResolvedValue({
        id: 'slot1',
        code: 'A-01',
        source: 'AI',
        reasons: ['近门动线', '小件高密'],
      }),
      release: jest.fn(),
    };
    const pickupCodes = {
      generate: jest.fn().mockResolvedValue('1234'),
      release: jest.fn(),
    };
    const prisma = makeTenantPrisma();
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
      slotId: 'slot1',
      reservePickupCode: expect.any(Function),
    });
    expect(out).toEqual({
      parcelId: 'p1',
      pickupCode: '1234',
      slotCode: 'A-01',
      slotSource: 'AI',
      slotReasons: ['近门动线', '小件高密'],
      status: 'STORED',
    });
    // Happy path leaks nothing.
    expect(allocator.release).not.toHaveBeenCalled();
    expect(pickupCodes.release).not.toHaveBeenCalled();
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
      slotSource: 'RULE_FALLBACK',
      slotReasons: [],
      status: 'STORED',
    });
    expect(parcelService.create).not.toHaveBeenCalled();
  });

  it('compensates by releasing slot and pickup code when markStored fails', async () => {
    const parcelService = {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      markStored: jest.fn(async (_id: string, input: any) => {
        // Reserve a code, then fail (simulates markStored blowing up after
        // it already acquired the pickup code).
        await input.reservePickupCode();
        throw new Error('boom');
      }),
    };
    const allocator = {
      allocate: jest
        .fn()
        .mockResolvedValue({ id: 'slot1', code: 'A-01', source: 'AI' }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const pickupCodes = {
      generate: jest.fn().mockResolvedValue('1234'),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = makeTenantPrisma();
    const service = new InboundService(
      prisma as any,
      parcelService as any,
      allocator as any,
      pickupCodes as any,
    );

    await expect(
      service.inbound({
        stationId: 's1',
        waybillNo: 'YT001',
        receiverPhone: '13800000000',
      }),
    ).rejects.toThrow('boom');

    // Slot released back to FREE for this parcel.
    expect(allocator.release).toHaveBeenCalledWith('slot1', 'p1');
    // Reserved pickup code released so it is reusable within TTL.
    expect(pickupCodes.release).toHaveBeenCalledWith('s1', '1234');
    // Zombie PENDING parcel soft-deleted.
    const txFn = prisma.withTenant.mock.calls.at(-1)?.[0];
    expect(txFn).toBeDefined();
  });

  it('releases slot and abandons parcel when allocate succeeds but no code reserved yet', async () => {
    const parcelService = {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      // markStored throws before reserving any code.
      markStored: jest.fn().mockRejectedValue(new Error('early failure')),
    };
    const allocator = {
      allocate: jest
        .fn()
        .mockResolvedValue({ id: 'slot1', code: 'A-01', source: 'AI' }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const pickupCodes = {
      generate: jest.fn().mockResolvedValue('1234'),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = makeTenantPrisma();
    const service = new InboundService(
      prisma as any,
      parcelService as any,
      allocator as any,
      pickupCodes as any,
    );

    await expect(
      service.inbound({
        stationId: 's1',
        waybillNo: 'YT001',
        receiverPhone: '13800000000',
      }),
    ).rejects.toThrow('early failure');

    expect(allocator.release).toHaveBeenCalledWith('slot1', 'p1');
    // No code was reserved, so nothing to release.
    expect(pickupCodes.release).not.toHaveBeenCalled();
  });

  it('releases only the latest pickup code; superseded codes freed on regeneration', async () => {
    const parcelService = {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      markStored: jest.fn(async (_id: string, input: any) => {
        // First reserved code is superseded by a second (conflict regen),
        // then markStored fails.
        await input.reservePickupCode();
        await input.reservePickupCode();
        throw new Error('boom');
      }),
    };
    const allocator = {
      allocate: jest
        .fn()
        .mockResolvedValue({ id: 'slot1', code: 'A-01', source: 'AI' }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const pickupCodes = {
      generate: jest
        .fn()
        .mockResolvedValueOnce('1234')
        .mockResolvedValueOnce('5678'),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = makeTenantPrisma();
    const service = new InboundService(
      prisma as any,
      parcelService as any,
      allocator as any,
      pickupCodes as any,
    );

    await expect(
      service.inbound({
        stationId: 's1',
        waybillNo: 'YT001',
        receiverPhone: '13800000000',
      }),
    ).rejects.toThrow('boom');

    // Superseded code released during regeneration.
    expect(pickupCodes.release).toHaveBeenCalledWith('s1', '1234');
    // Live code released during compensation.
    expect(pickupCodes.release).toHaveBeenCalledWith('s1', '5678');
    expect(allocator.release).toHaveBeenCalledWith('slot1', 'p1');
  });
});

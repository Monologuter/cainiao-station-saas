import { ApiCode } from '../../core/http/api-code';
import { PickupService } from './pickup.service';

function storedParcel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    tenantId: 't1',
    stationId: 's1',
    receiverPhone: '13800000000',
    receiverPhoneTail: '0000',
    pickupCode: '1234',
    status: 'STORED',
    version: 2,
    slotId: 'slot1',
    ...overrides,
  };
}

describe('PickupService', () => {
  it('picks up parcel by pickup code alone and releases the reservation', async () => {
    const tx = {
      parcel: { findMany: async () => [storedParcel()] },
      pickupAuthorization: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const locks = { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any;
    const parcels = {
      markPickedUp: jest
        .fn()
        .mockResolvedValue({ id: 'p1', status: 'PICKED_UP' }),
    } as any;
    const pickupCodes = { release: jest.fn() } as any;
    const service = new PickupService(
      tenantPrisma,
      locks,
      parcels,
      pickupCodes,
    );

    await expect(
      service.pickup({ stationId: 's1', pickupCode: '1234' }),
    ).resolves.toEqual({
      parcelId: 'p1',
      status: 'PICKED_UP',
      slotReleased: true,
    });
    expect(locks.withLock).toHaveBeenCalledWith(
      'lock:parcel:p1',
      10000,
      expect.any(Function),
    );
    expect(parcels.markPickedUp).toHaveBeenCalledWith('p1', 2);
    expect(pickupCodes.release).toHaveBeenCalledWith('s1', '1234');
  });

  it('picks up parcel by phone tail alone when it uniquely identifies a stored parcel', async () => {
    const findMany = jest.fn(async () => [storedParcel()]);
    const tx = {
      parcel: { findMany },
      pickupAuthorization: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    const locks = { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any;
    const parcels = {
      markPickedUp: jest
        .fn()
        .mockResolvedValue({ id: 'p1', status: 'PICKED_UP' }),
    } as any;
    const pickupCodes = { release: jest.fn() } as any;
    const service = new PickupService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      locks,
      parcels,
      pickupCodes,
    );

    await expect(
      service.pickup({ stationId: 's1', phoneTail: '0000' }),
    ).resolves.toMatchObject({ status: 'PICKED_UP' });
    // 仅尾号时按 receiverPhoneTail 过滤定位包裹。
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: 's1',
          status: 'STORED',
          receiverPhoneTail: '0000',
        }),
      }),
    );
    expect(parcels.markPickedUp).toHaveBeenCalledWith('p1', 2);
  });

  it('rejects ambiguous phone tail matching multiple stored parcels', async () => {
    const tx = {
      parcel: {
        findMany: async () => [storedParcel(), storedParcel({ id: 'p2' })],
      },
    };
    const service = new PickupService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.pickup({ stationId: 's1', phoneTail: '0000' }),
    ).rejects.toMatchObject({ code: ApiCode.AMBIGUOUS_PICKUP });
  });

  it('rejects ambiguous pickup code matching multiple stored parcels', async () => {
    const tx = {
      parcel: {
        findMany: async () => [storedParcel(), storedParcel({ id: 'p2' })],
      },
    };
    const service = new PickupService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.pickup({ stationId: 's1', pickupCode: '1234' }),
    ).rejects.toMatchObject({ code: ApiCode.AMBIGUOUS_PICKUP });
  });

  it('still requires an active authorization when a different full phone picks up', async () => {
    const tx = {
      parcel: {
        findMany: jest.fn(async () => [storedParcel({ version: 1 })]),
      },
      pickupAuthorization: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PickupService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      { withLock: jest.fn() } as any,
      { markPickedUp: jest.fn() } as any,
      { release: jest.fn() } as any,
    );

    await expect(
      service.pickup({
        stationId: 's1',
        pickupCode: '1234',
        authorizedPhone: '13900000000',
      }),
    ).rejects.toMatchObject({ code: ApiCode.FORBIDDEN });
    expect(tx.pickupAuthorization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          ownerPhone: '13800000000',
          authorizedPhone: '13900000000',
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('lets an authorized proxy pick up using the authorized full phone', async () => {
    const tx = {
      parcel: {
        findMany: async () => [storedParcel({ version: 1 })],
      },
      pickupAuthorization: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ authorizedPhone: '13900000000', status: 'ACTIVE' }),
      },
    };
    const locks = { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any;
    const parcels = {
      markPickedUp: jest
        .fn()
        .mockResolvedValue({ id: 'p1', status: 'PICKED_UP' }),
    } as any;
    const service = new PickupService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      locks,
      parcels,
      { release: jest.fn() } as any,
    );

    await expect(
      service.pickup({
        stationId: 's1',
        pickupCode: '1234',
        authorizedPhone: '13900000000',
      }),
    ).resolves.toMatchObject({ status: 'PICKED_UP' });
    expect(parcels.markPickedUp).toHaveBeenCalledWith('p1', 1);
    expect(tx.pickupAuthorization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          ownerPhone: '13800000000',
          authorizedPhone: '13900000000',
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('throws PARCEL_NOT_FOUND when no stored parcel matches the identifier', async () => {
    const tx = { parcel: { findMany: async () => [] } };
    const service = new PickupService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.pickup({ stationId: 's1', pickupCode: 'missing' }),
    ).rejects.toMatchObject({ code: ApiCode.PARCEL_NOT_FOUND });
  });

  it('rejects empty pickup request before touching the parcel store (no zero-verification dispatch)', async () => {
    const findMany = jest.fn(async () => [storedParcel({ version: 1 })]);
    const markPickedUp = jest.fn();
    const withLock = jest.fn();
    const release = jest.fn();
    const service = new PickupService(
      { withTenant: async (fn: any) => fn({ parcel: { findMany } }) } as any,
      { withLock } as any,
      { markPickedUp } as any,
      { release } as any,
    );

    await expect(service.pickup({ stationId: 's1' })).rejects.toMatchObject({
      code: ApiCode.BAD_REQUEST,
    });
    // Guard must short-circuit before any query so the where clause cannot
    // degrade to "all STORED at station".
    expect(findMany).not.toHaveBeenCalled();
    expect(withLock).not.toHaveBeenCalled();
    expect(markPickedUp).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('does not mis-dispatch the sole stored parcel when all identifiers are blank', async () => {
    // Even with exactly one STORED parcel at the station, an identifier-less
    // request must be refused rather than silently picked up.
    const findMany = jest.fn(async () => [
      storedParcel({ id: 'only', pickupCode: '9999', version: 1 }),
    ]);
    const markPickedUp = jest.fn();
    const service = new PickupService(
      { withTenant: async (fn: any) => fn({ parcel: { findMany } }) } as any,
      { withLock: jest.fn() } as any,
      { markPickedUp } as any,
      { release: jest.fn() } as any,
    );

    await expect(
      service.pickup({
        stationId: 's1',
        pickupCode: '  ',
        phoneTail: '',
        parcelId: undefined,
      }),
    ).rejects.toMatchObject({ code: ApiCode.BAD_REQUEST });
    expect(findMany).not.toHaveBeenCalled();
    expect(markPickedUp).not.toHaveBeenCalled();
  });

  it('converts stale optimistic pickup to ALREADY_PICKED_UP', async () => {
    const tx = {
      parcel: { findMany: async () => [storedParcel()] },
      pickupAuthorization: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const locks = { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any;
    const parcels = {
      markPickedUp: jest.fn().mockRejectedValue(
        Object.assign(new Error('包裹已被取走'), {
          code: ApiCode.ALREADY_PICKED_UP,
        }),
      ),
    } as any;
    const service = new PickupService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      locks,
      parcels,
      { release: jest.fn() } as any,
    );

    await expect(
      service.pickup({ stationId: 's1', pickupCode: '1234' }),
    ).rejects.toMatchObject({ code: ApiCode.ALREADY_PICKED_UP });
  });
});

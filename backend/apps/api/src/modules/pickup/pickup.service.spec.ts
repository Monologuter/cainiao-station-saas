import { ApiCode } from '../../core/http/api-code';
import { PickupService } from './pickup.service';

describe('PickupService', () => {
  it('picks up parcel by pickup code and releases pickup code reservation', async () => {
    const tx = {
      parcel: {
        findMany: async () => [
          {
            id: 'p1',
            stationId: 's1',
            pickupCode: '1234',
            status: 'STORED',
            version: 2,
            slotId: 'slot1',
          },
        ],
      },
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

  it('rejects ambiguous phone tail pickup', async () => {
    const tx = {
      parcel: {
        findMany: async () => [{ id: 'p1' }, { id: 'p2' }],
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

  it('throws PARCEL_NOT_FOUND when no stored parcel matches', async () => {
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

  it('converts stale optimistic pickup to ALREADY_PICKED_UP', async () => {
    const tx = {
      parcel: {
        findMany: async () => [
          {
            id: 'p1',
            stationId: 's1',
            pickupCode: '1234',
            status: 'STORED',
            version: 2,
          },
        ],
      },
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

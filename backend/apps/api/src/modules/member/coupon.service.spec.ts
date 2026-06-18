import { BizError } from '../../core/http/api-code';
import { CouponService } from './coupon.service';

describe('CouponService', () => {
  it('creates coupon template in current tenant', async () => {
    const tx = {
      couponTemplate: {
        create: jest.fn(async ({ data }: any) => ({ id: 'ct1', ...data })),
      },
    };
    const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const service = new CouponService(tenantPrisma, prisma, {} as any);

    const out = await service.createTemplate('t1', {
      name: '寄件 5 元券',
      type: 'DISCOUNT',
      faceValue: 5,
      threshold: 20,
      scene: 'SHIP',
      costPoints: 50,
      totalStock: 100,
      validDays: 7,
    });

    expect(out).toMatchObject({
      tenantId: 't1',
      name: '寄件 5 元券',
      costPoints: 50,
      issuedCount: 0,
      status: 'ACTIVE',
    });
  });

  it('redeems template by points and issues coupon', async () => {
    const template = {
      id: 'ct1',
      tenantId: 't1',
      name: '券',
      costPoints: 50,
      totalStock: 10,
      issuedCount: 2,
      validDays: 7,
      status: 'ACTIVE',
    };
    const tx = {
      $executeRawUnsafe: jest.fn(),
      couponTemplate: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(template),
        update: jest.fn(),
      },
      coupon: {
        create: jest.fn(async ({ data }: any) => ({ id: 'cp1', ...data })),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const points = {
      spend: jest.fn().mockResolvedValue({ id: 'pr1' }),
    } as any;
    const service = new CouponService({} as any, prisma, points);

    const coupon = await service.redeemByPoints('m1', 'ct1');

    expect(points.spend).toHaveBeenCalledWith('m1', 50, 'COUPON_REDEEM', {
      sourceTenantId: 't1',
      refType: 'coupon_template',
      refId: 'ct1',
      idempotencyKey: expect.stringMatching(/^coupon-redeem:/),
      remark: '积分兑换券',
    });
    expect(tx.couponTemplate.update).toHaveBeenCalledWith({
      where: { id: 'ct1' },
      data: { issuedCount: { increment: 1 } },
    });
    expect(coupon).toMatchObject({
      tenantId: 't1',
      templateId: 'ct1',
      memberId: 'm1',
      status: 'UNUSED',
      obtainedVia: 'POINT_REDEEM',
      pointRecordId: 'pr1',
    });
  });

  it('rejects redeem when stock is exhausted', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      couponTemplate: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ct1',
          tenantId: 't1',
          costPoints: 10,
          totalStock: 2,
          issuedCount: 2,
          validDays: 7,
          status: 'ACTIVE',
        }),
      },
    };
    const service = new CouponService(
      {} as any,
      { $transaction: (fn: any) => fn(tx) } as any,
      {
        spend: jest.fn(),
      } as any,
    );

    await expect(service.redeemByPoints('m1', 'ct1')).rejects.toBeInstanceOf(
      BizError,
    );
  });

  describe('listTemplates cross-tenant read protection (security regression)', () => {
    it('rejects when tenantId is missing (no full-library leak)', async () => {
      const tx = {
        $executeRawUnsafe: jest.fn(),
        couponTemplate: { findMany: jest.fn() },
      };
      const prisma = { $transaction: (fn: any) => fn(tx) } as any;
      const service = new CouponService({} as any, prisma, {} as any);

      await expect(service.listTemplates({} as any)).rejects.toBeInstanceOf(
        BizError,
      );
      // 缺 tenantId 时绝不查询，避免返回他人模板。
      expect(tx.couponTemplate.findMany).not.toHaveBeenCalled();
    });

    it('always scopes the query to the requested tenant and ACTIVE status', async () => {
      const tx = {
        $executeRawUnsafe: jest.fn(),
        couponTemplate: {
          findMany: jest.fn().mockResolvedValue([{ id: 'ct1', tenantId: 't1' }]),
        },
      };
      const prisma = { $transaction: (fn: any) => fn(tx) } as any;
      const service = new CouponService({} as any, prisma, {} as any);

      const out = await service.listTemplates({ tenantId: 't1' });

      expect(out).toMatchObject({ total: 1 });
      const where = tx.couponTemplate.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        tenantId: 't1',
        status: 'ACTIVE',
        deletedAt: null,
      });
    });

    it('does not allow a different tenantId to widen the scope', async () => {
      const tx = {
        $executeRawUnsafe: jest.fn(),
        couponTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const prisma = { $transaction: (fn: any) => fn(tx) } as any;
      const service = new CouponService({} as any, prisma, {} as any);

      await service.listTemplates({ tenantId: 't-self', scene: 'SHIP' });

      const where = tx.couponTemplate.findMany.mock.calls[0][0].where;
      // 永远按传入 tenantId 过滤，绝无"未传则全库"的分支。
      expect(where.tenantId).toBe('t-self');
      expect(where.scene).toEqual({ in: ['SHIP', 'ALL'] });
    });
  });

  it('verifies unused coupon idempotently and expires old coupons', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      coupon: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'cp1',
          tenantId: 't1',
          status: 'UNUSED',
          expireAt: new Date(Date.now() + 86400000),
          usedRefType: null,
          usedRefId: null,
        }),
        update: jest.fn(async ({ data }: any) => ({ id: 'cp1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const service = new CouponService(tenantPrisma, prisma, {} as any);

    await service.verify('cp1', {
      usedRefType: 'ship_order',
      usedRefId: 'so1',
      idempotencyKey: 'verify:so1',
    });
    expect(tx.coupon.update).toHaveBeenCalledWith({
      where: { id: 'cp1' },
      data: expect.objectContaining({
        status: 'USED',
        usedRefType: 'ship_order',
        usedRefId: 'so1',
        usedAt: expect.any(Date),
      }),
    });

    await expect(service.expireScan()).resolves.toBe(3);
  });
});

import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ReviewService } from './review.service';

const VERIFIED_PHONE = '13800000000';

function runAsTenant<T>(fn: () => T) {
  return TenantContext.run(
    {
      userId: 'staff-1',
      tenantId: 'tenant-1',
      roles: ['店长'],
      isPlatform: false,
    },
    fn,
  );
}

/**
 * 构造一个既能被 withBypass(回退到 tenantPrisma) 复用、又能被写入事务复用的 tx mock。
 * resolveOwnedRef 在缺省 prisma 时会回退到 tenantPrisma.withTenant，故 ref 反查也命中该 tx。
 */
function buildService(tx: any) {
  return new ReviewService({
    withTenant: async (fn: any) => fn(tx),
  } as any);
}

describe('ReviewService', () => {
  it('submits a rating from 1 to 5 once per business reference', async () => {
    const tx = {
      parcel: {
        findFirst: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          stationId: 'station-1',
          receiverPhone: VERIFIED_PHONE,
        }),
      },
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'member-1',
          phone: VERIFIED_PHONE,
        }),
      },
      review: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({
          id: 'review-1',
          status: 'PUBLISHED',
          ...data,
        })),
      },
    };
    const service = buildService(tx);

    const out = await runAsTenant(() =>
      service.submit('member-1', VERIFIED_PHONE, {
        targetType: 'PICKUP',
        refType: 'parcel',
        refId: 'parcel-1',
        rating: 5,
        tags: ['服务好', '位置近'],
        content: '取件很快',
      }),
    );

    expect(out).toMatchObject({ id: 'review-1', status: 'PUBLISHED' });
    // tenantId/stationId 来源于反查出的包裹，而非请求 body。
    expect(tx.review.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        stationId: 'station-1',
        memberId: 'member-1',
        consumerPhone: VERIFIED_PHONE,
        targetType: 'PICKUP',
        refType: 'parcel',
        refId: 'parcel-1',
        rating: 5,
        tags: ['服务好', '位置近'],
        content: '取件很快',
        images: [],
      },
    });
  });

  it('rejects invalid rating and duplicate reviews', async () => {
    const tx = {
      parcel: {
        findFirst: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          stationId: 'station-1',
          receiverPhone: VERIFIED_PHONE,
        }),
      },
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'member-1',
          phone: VERIFIED_PHONE,
        }),
      },
      review: {
        findFirst: jest.fn().mockResolvedValue({ id: 'review-old' }),
      },
    };
    const service = buildService(tx);

    await expect(
      runAsTenant(() =>
        service.submit('member-1', VERIFIED_PHONE, {
          targetType: 'PICKUP',
          refType: 'parcel',
          refId: 'parcel-1',
          rating: 0,
        }),
      ),
    ).rejects.toThrow('评分必须在 1 到 5 之间');

    await expect(
      runAsTenant(() =>
        service.submit('member-1', VERIFIED_PHONE, {
          targetType: 'PICKUP',
          refType: 'parcel',
          refId: 'parcel-1',
          rating: 5,
        }),
      ),
    ).rejects.toThrow('该业务单已评价');
  });

  describe('cross-tenant write protection (security regression)', () => {
    it('rejects review when the parcel does not belong to the verified phone', async () => {
      const tx = {
        parcel: {
          findFirst: jest.fn().mockResolvedValue({
            tenantId: 'tenant-victim',
            stationId: 'station-victim',
            receiverPhone: '13999999999', // 包裹属于他人
          }),
        },
        member: {
          findUniqueOrThrow: jest.fn(),
        },
        review: {
          findFirst: jest.fn(),
          create: jest.fn(),
        },
      };
      const service = buildService(tx);

      await expect(
        runAsTenant(() =>
          service.submit('attacker-member', VERIFIED_PHONE, {
            targetType: 'PICKUP',
            refType: 'parcel',
            refId: 'victim-parcel',
            rating: 1,
          }),
        ),
      ).rejects.toMatchObject({ code: ApiCode.FORBIDDEN });

      // 攻击者无法落库任何脏数据。
      expect(tx.review.create).not.toHaveBeenCalled();
    });

    it('rejects review when the parcel does not exist', async () => {
      const tx = {
        parcel: { findFirst: jest.fn().mockResolvedValue(null) },
        review: { create: jest.fn() },
      };
      const service = buildService(tx);

      await expect(
        runAsTenant(() =>
          service.submit('attacker-member', VERIFIED_PHONE, {
            targetType: 'PICKUP',
            refType: 'parcel',
            refId: 'ghost-parcel',
            rating: 1,
          }),
        ),
      ).rejects.toMatchObject({ code: ApiCode.NOT_FOUND });
      expect(tx.review.create).not.toHaveBeenCalled();
    });

    it('rejects body-supplied tenantId injection and writes to the parcel owning tenant', async () => {
      const tx = {
        parcel: {
          findFirst: jest.fn().mockResolvedValue({
            tenantId: 'tenant-real',
            stationId: 'station-real',
            receiverPhone: VERIFIED_PHONE,
          }),
        },
        member: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'member-1',
            phone: VERIFIED_PHONE,
          }),
        },
        review: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(async ({ data }: any) => ({
            id: 'review-1',
            ...data,
          })),
        },
      };
      const service = buildService(tx);

      const out = await runAsTenant(() =>
        service.submit('member-1', VERIFIED_PHONE, {
          // 攻击者试图注入的 tenantId/stationId 会被忽略（接口已不接收这些字段）。
          tenantId: 'tenant-attacker',
          stationId: 'station-attacker',
          targetType: 'PICKUP',
          refType: 'parcel',
          refId: 'parcel-1',
          rating: 5,
        } as any),
      );

      expect(out).toMatchObject({
        tenantId: 'tenant-real',
        stationId: 'station-real',
      });
    });

    it('resolves ship_order ref by sender phone for SHIP reviews', async () => {
      const tx = {
        shipOrder: {
          findFirst: jest.fn().mockResolvedValue({
            tenantId: 'tenant-ship',
            stationId: 'station-ship',
            senderJson: { name: '寄件人', phone: VERIFIED_PHONE },
          }),
        },
        member: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'member-1',
            phone: VERIFIED_PHONE,
          }),
        },
        review: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(async ({ data }: any) => ({
            id: 'review-1',
            ...data,
          })),
        },
      };
      const service = buildService(tx);

      const out = await runAsTenant(() =>
        service.submit('member-1', VERIFIED_PHONE, {
          targetType: 'SHIP',
          refType: 'ship_order',
          refId: 'so-1',
          rating: 4,
        }),
      );

      expect(out).toMatchObject({
        tenantId: 'tenant-ship',
        stationId: 'station-ship',
      });
    });

    it('rejects ship_order review when sender phone differs', async () => {
      const tx = {
        shipOrder: {
          findFirst: jest.fn().mockResolvedValue({
            tenantId: 'tenant-ship',
            stationId: 'station-ship',
            senderJson: { name: '别人', phone: '13700000000' },
          }),
        },
        review: { create: jest.fn() },
      };
      const service = buildService(tx);

      await expect(
        runAsTenant(() =>
          service.submit('attacker-member', VERIFIED_PHONE, {
            targetType: 'SHIP',
            refType: 'ship_order',
            refId: 'so-1',
            rating: 1,
          }),
        ),
      ).rejects.toMatchObject({ code: ApiCode.FORBIDDEN });
      expect(tx.review.create).not.toHaveBeenCalled();
    });

    it('rejects complaint when the parcel belongs to another consumer', async () => {
      const tx = {
        parcel: {
          findFirst: jest.fn().mockResolvedValue({
            tenantId: 'tenant-victim',
            stationId: 'station-victim',
            receiverPhone: '13999999999',
          }),
        },
        complaint: { create: jest.fn() },
      };
      const service = buildService(tx);

      await expect(
        runAsTenant(() =>
          service.submitComplaint('attacker-member', VERIFIED_PHONE, {
            type: 'SERVICE',
            content: '注入投诉',
            refType: 'parcel',
            refId: 'victim-parcel',
          }),
        ),
      ).rejects.toMatchObject({ code: ApiCode.FORBIDDEN });
      expect(tx.complaint.create).not.toHaveBeenCalled();
    });
  });

  it('replies to published reviews and hides visible reviews', async () => {
    const tx = {
      review: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ id: 'review-1', status: 'PUBLISHED' })
          .mockResolvedValueOnce({ id: 'review-1', status: 'REPLIED' }),
        update: jest.fn(async ({ data }: any) => ({ id: 'review-1', ...data })),
      },
    };
    const service = buildService(tx);

    const replied = await runAsTenant(() =>
      service.reply('review-1', 'staff-2', '感谢认可'),
    );
    const hidden = await runAsTenant(() =>
      service.hide('review-1', 'staff-2', '含敏感内容'),
    );

    expect(replied).toMatchObject({
      status: 'REPLIED',
      replyContent: '感谢认可',
      repliedBy: 'staff-2',
    });
    expect(hidden).toMatchObject({
      status: 'HIDDEN',
      hiddenBy: 'staff-2',
      hideReason: '含敏感内容',
    });
  });

  it('handles complaint status transitions in order', async () => {
    const tx = {
      parcel: {
        findFirst: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          stationId: 'station-1',
          receiverPhone: VERIFIED_PHONE,
        }),
      },
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'member-1',
          phone: VERIFIED_PHONE,
        }),
      },
      complaint: {
        create: jest.fn(async ({ data }: any) => ({
          id: 'complaint-1',
          status: 'PENDING',
          ...data,
        })),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ id: 'complaint-1', status: 'PENDING' })
          .mockResolvedValueOnce({ id: 'complaint-1', status: 'PROCESSING' }),
        update: jest.fn(async ({ data }: any) => ({
          id: 'complaint-1',
          ...data,
        })),
      },
    };
    const service = buildService(tx);

    const created = await runAsTenant(() =>
      service.submitComplaint('member-1', VERIFIED_PHONE, {
        type: 'SERVICE',
        content: '服务态度需要改进',
        refType: 'parcel',
        refId: 'parcel-1',
      }),
    );
    const processing = await runAsTenant(() =>
      service.handleComplaint('complaint-1', 'staff-2', {
        status: 'PROCESSING',
        note: '已联系用户',
      }),
    );
    const resolved = await runAsTenant(() =>
      service.handleComplaint('complaint-1', 'staff-2', {
        status: 'RESOLVED',
        note: '已道歉并补偿',
      }),
    );

    expect(created).toMatchObject({
      status: 'PENDING',
      tenantId: 'tenant-1',
      stationId: 'station-1',
    });
    expect(processing).toMatchObject({ status: 'PROCESSING' });
    expect(resolved).toMatchObject({ status: 'RESOLVED' });
  });

  it('rejects illegal complaint transitions', async () => {
    const tx = {
      complaint: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'complaint-1',
          status: 'PENDING',
        }),
      },
    };
    const service = buildService(tx);

    await expect(
      runAsTenant(() =>
        service.handleComplaint('complaint-1', 'staff-2', {
          status: 'CLOSED',
          note: '直接关闭',
        }),
      ),
    ).rejects.toThrow('投诉状态流转非法');
  });

  it('is exported as BizError for typed assertions', () => {
    expect(new BizError(ApiCode.FORBIDDEN, 'x')).toBeInstanceOf(BizError);
  });
});

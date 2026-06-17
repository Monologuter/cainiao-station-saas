import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ReviewService } from './review.service';

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

describe('ReviewService', () => {
  it('submits a rating from 1 to 5 once per business reference', async () => {
    const tx = {
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'member-1',
          phone: '13800000000',
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
    const service = new ReviewService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    const out = await runAsTenant(() =>
      service.submit('member-1', {
        stationId: 'station-1',
        targetType: 'PICKUP',
        refType: 'parcel',
        refId: 'parcel-1',
        rating: 5,
        tags: ['服务好', '位置近'],
        content: '取件很快',
      }),
    );

    expect(out).toMatchObject({ id: 'review-1', status: 'PUBLISHED' });
    expect(tx.review.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        stationId: 'station-1',
        memberId: 'member-1',
        consumerPhone: '13800000000',
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
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'member-1',
          phone: '13800000000',
        }),
      },
      review: {
        findFirst: jest.fn().mockResolvedValue({ id: 'review-old' }),
      },
    };
    const service = new ReviewService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await expect(
      runAsTenant(() =>
        service.submit('member-1', {
          stationId: 'station-1',
          targetType: 'PICKUP',
          refType: 'parcel',
          refId: 'parcel-1',
          rating: 0,
        }),
      ),
    ).rejects.toThrow('评分必须在 1 到 5 之间');

    await expect(
      runAsTenant(() =>
        service.submit('member-1', {
          stationId: 'station-1',
          targetType: 'PICKUP',
          refType: 'parcel',
          refId: 'parcel-1',
          rating: 5,
        }),
      ),
    ).rejects.toThrow('该业务单已评价');
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
    const service = new ReviewService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

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
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'member-1',
          phone: '13800000000',
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
    const service = new ReviewService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    const created = await runAsTenant(() =>
      service.submitComplaint('member-1', {
        stationId: 'station-1',
        type: 'SERVICE',
        content: '服务态度需要改进',
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

    expect(created).toMatchObject({ status: 'PENDING' });
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
    const service = new ReviewService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await expect(
      runAsTenant(() =>
        service.handleComplaint('complaint-1', 'staff-2', {
          status: 'CLOSED',
          note: '直接关闭',
        }),
      ),
    ).rejects.toThrow('投诉状态流转非法');
  });
});

import { ApiCode } from '../../../core/http/api-code';
import { ApplicationService } from './application.service';

describe('ApplicationService review', () => {
  it('approves a pending application by delegating to onboarding provision', async () => {
    const { service, onboarding } = createService();

    const result = await service.approve('app-1', 'admin-1', {
      planCode: 'STANDARD',
      stationName: '审核后门店',
    });

    expect(onboarding.provision).toHaveBeenCalledWith({
      applicationId: 'app-1',
      reviewerId: 'admin-1',
      planCode: 'STANDARD',
      stationName: '审核后门店',
    });
    expect(result).toEqual({
      tenantId: 'tenant-1',
      ownerUsername: '13800000001',
    });
  });

  it('rejects a pending application with reason and publishes an event', async () => {
    const { service, tx, eventBus } = createService();

    await service.reject('app-1', 'admin-1', '资料不完整');

    expect(tx.tenantApplication.update).toHaveBeenCalledWith({
      where: { id: 'app-1' },
      data: expect.objectContaining({
        status: 'REJECTED',
        reviewedBy: 'admin-1',
        rejectReason: '资料不完整',
      }),
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ApplicationRejected',
        payload: {
          applicationId: 'app-1',
          contactPhone: '13800000001',
          rejectReason: '资料不完整',
        },
      }),
    );
  });

  it('rejects terminal applications and missing reject reasons', async () => {
    const terminal = createService({ application: { status: 'APPROVED' } });
    await expect(
      terminal.service.approve('app-1', 'admin-1'),
    ).rejects.toMatchObject({ code: ApiCode.ILLEGAL_TRANSITION });

    const { service } = createService();
    await expect(service.reject('app-1', 'admin-1', ' ')).rejects.toMatchObject(
      {
        code: ApiCode.BAD_REQUEST,
        message: expect.stringContaining('驳回原因'),
      },
    );
  });

  function createService(options: any = {}) {
    const application = {
      id: 'app-1',
      status: options.application?.status ?? 'PENDING',
      contactPhone: '13800000001',
    };
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      tenantApplication: {
        findUnique: jest.fn().mockResolvedValue(application),
        update: jest.fn().mockResolvedValue({
          ...application,
          status: 'REJECTED',
          rejectReason: '资料不完整',
        }),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const files = { createDownloadUrl: jest.fn() };
    const onboarding = {
      provision: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        ownerUsername: '13800000001',
      }),
    };
    const eventBus = { publish: jest.fn() };
    return {
      service: new ApplicationService(
        prisma as any,
        files as any,
        onboarding as any,
        eventBus as any,
      ),
      tx,
      onboarding,
      eventBus,
    };
  }
});
